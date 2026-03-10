import { checkBackendHealth, requestSessionToken, startTextChatStream } from '../api/backend';
import { useSessionStore } from '../store/sessionStore';
import {
  defaultRuntimeLogger,
  logLifecycleTransition,
  logRuntimeDiagnostic,
  logRuntimeError,
} from './logger';
import { formatConversationTimestamp } from './conversationTimestamp';
import { createGeminiLiveTransport } from './geminiLiveTransport';
import {
  createTextSessionLifecycle,
  isSessionActiveLifecycle,
  isTextSessionConnectable,
  isTextTurnInFlight,
  reduceTextSessionLifecycle,
  type TextSessionLifecycleEvent,
} from './textSessionLifecycle';
import type {
  ConversationTurnModel,
  DesktopSession,
  LiveSessionEvent,
  RuntimeLogger,
  SessionControllerEvent,
  SessionMode,
  TextSessionStatus,
  TransportKind,
} from './types';
import type {
  TextChatMessage,
  TextChatRequest,
  TextChatStreamEvent,
} from '@livepair/shared-types';

const TEXT_CHAT_ADAPTER_KEY: TransportKind = 'backend-text';
const VOICE_MODE_UNAVAILABLE_DETAIL = 'Voice mode is not available in this release';

type SessionStoreApi = Pick<typeof useSessionStore, 'getState'>;
type DebugAssistantState = Parameters<
  ReturnType<SessionStoreApi['getState']>['setAssistantState']
>[0];

export type DesktopSessionController = {
  checkBackendHealth: () => Promise<void>;
  startSession: (options: { mode: SessionMode }) => Promise<void>;
  submitTextTurn: (text: string) => Promise<boolean>;
  endSession: () => Promise<void>;
  setAssistantState: (assistantState: DebugAssistantState) => void;
};

export type DesktopSessionControllerDependencies = {
  logger: RuntimeLogger;
  checkBackendHealth: typeof checkBackendHealth;
  startTextChatStream: typeof startTextChatStream;
  requestSessionToken: typeof requestSessionToken;
  createTransport: (kind: TransportKind) => DesktopSession;
  store: SessionStoreApi;
};

function asErrorDetail(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return fallback;
}

function createDebugEvent(
  scope: 'session' | 'transport',
  type: string,
  detail?: string,
) {
  return {
    scope,
    type,
    at: new Date().toISOString(),
    detail,
  };
}

export function createDesktopSessionController(
  overrides: Partial<DesktopSessionControllerDependencies> = {},
): DesktopSessionController {
  const dependencies: DesktopSessionControllerDependencies = {
    logger: defaultRuntimeLogger,
    checkBackendHealth,
    startTextChatStream,
    requestSessionToken,
    createTransport: (_kind) => createGeminiLiveTransport(),
    store: useSessionStore,
    ...overrides,
  };

  let activeTransport: DesktopSession | null = null;
  let unsubscribeTransport: (() => void) | null = null;
  let activeTextChatStream:
    | Awaited<ReturnType<DesktopSessionControllerDependencies['startTextChatStream']>>
    | null = null;
  let sessionOperationId = 0;
  let nextUserTurnId = 0;
  let nextAssistantTurnId = 0;
  let pendingAssistantTurnId: string | null = null;

  const recordSessionEvent = (event: SessionControllerEvent): void => {
    dependencies.logger.onSessionEvent(event);
    dependencies.store
      .getState()
      .setLastDebugEvent(
        createDebugEvent(
          'session',
          event.type,
          'detail' in event ? event.detail : undefined,
        ),
      );
  };

  const getConversationTurn = (turnId: string): ConversationTurnModel | undefined => {
    return dependencies.store
      .getState()
      .conversationTurns.find((turn) => turn.id === turnId);
  };

  const clearPendingAssistantTurn = (): void => {
    pendingAssistantTurnId = null;
  };

  const currentTextSessionStatus = (): TextSessionStatus => {
    return dependencies.store.getState().textSessionLifecycle.status;
  };

  const applyLifecycleEvent = (
    event: TextSessionLifecycleEvent,
  ): TextSessionStatus => {
    const store = dependencies.store.getState();
    const previousStatus = store.textSessionLifecycle.status;
    const nextLifecycle = reduceTextSessionLifecycle(store.textSessionLifecycle, event);

    if (nextLifecycle.status !== previousStatus) {
      store.setTextSessionLifecycle(nextLifecycle);
      logLifecycleTransition(previousStatus, nextLifecycle.status, event.type);
    }

    return nextLifecycle.status;
  };

  const releaseTextChatStream = (): void => {
    const stream = activeTextChatStream;
    activeTextChatStream = null;
    stream?.cancel().catch(() => {});
  };

  const cleanupTransport = (): void => {
    unsubscribeTransport?.();
    unsubscribeTransport = null;
    activeTransport = null;
    releaseTextChatStream();
    clearPendingAssistantTurn();
  };

  const beginSessionOperation = (): number => {
    sessionOperationId += 1;
    return sessionOperationId;
  };

  const isCurrentSessionOperation = (operationId: number): boolean =>
    operationId === sessionOperationId;

  const updatePendingAssistantTurn = (
    content: string,
    state: ConversationTurnModel['state'],
    statusLabel?: string,
  ): void => {
    if (!pendingAssistantTurnId) {
      return;
    }

    dependencies.store.getState().updateConversationTurn(pendingAssistantTurnId, {
      content,
      state,
      statusLabel,
    });
  };

  const appendAssistantTurn = (
    content: string,
    state: ConversationTurnModel['state'],
    statusLabel?: string,
  ): void => {
    const turnId = `assistant-turn-${++nextAssistantTurnId}`;
    pendingAssistantTurnId = turnId;
    dependencies.store.getState().appendConversationTurn({
      id: turnId,
      role: 'assistant',
      content,
      timestamp: formatConversationTimestamp(),
      state,
      statusLabel,
    });
  };

  const appendAssistantTextDelta = (text: string): void => {
    if (!pendingAssistantTurnId) {
      appendAssistantTurn(text, 'streaming', 'Responding...');
      return;
    }

    const currentTurn = getConversationTurn(pendingAssistantTurnId);

    if (!currentTurn) {
      appendAssistantTurn(text, 'streaming', 'Responding...');
      return;
    }

    updatePendingAssistantTurn(
      `${currentTurn.content}${text}`,
      'streaming',
      'Responding...',
    );
  };

  const upsertAssistantMessage = (
    text: string,
    state: ConversationTurnModel['state'] = 'streaming',
    statusLabel?: string,
  ): void => {
    if (!pendingAssistantTurnId) {
      appendAssistantTurn(text, state, statusLabel);
      return;
    }

    updatePendingAssistantTurn(text, state, statusLabel);
  };

  const completePendingAssistantTurn = (statusLabel?: string): void => {
    if (!pendingAssistantTurnId) {
      return;
    }

    const currentTurn = getConversationTurn(pendingAssistantTurnId);

    if (!currentTurn) {
      clearPendingAssistantTurn();
      return;
    }

    updatePendingAssistantTurn(currentTurn.content, 'complete', statusLabel);
    clearPendingAssistantTurn();
  };

  const markPendingAssistantTurnInterrupted = (): void => {
    if (!pendingAssistantTurnId) {
      return;
    }

    const currentTurn = getConversationTurn(pendingAssistantTurnId);

    if (!currentTurn) {
      clearPendingAssistantTurn();
      return;
    }

    updatePendingAssistantTurn(currentTurn.content, 'streaming', 'Interrupted');
  };

  const failPendingAssistantTurn = (statusLabel: string): void => {
    if (!pendingAssistantTurnId) {
      return;
    }

    const currentTurn = getConversationTurn(pendingAssistantTurnId);

    if (!currentTurn) {
      clearPendingAssistantTurn();
      return;
    }

    updatePendingAssistantTurn(currentTurn.content, 'error', statusLabel);
    clearPendingAssistantTurn();
  };

  const resetRuntimeState = (textSessionStatus: TextSessionStatus = 'idle'): void => {
    clearPendingAssistantTurn();
    dependencies.store.getState().reset({
      textSessionLifecycle: createTextSessionLifecycle(textSessionStatus),
    });
  };

  const setGoAwayState = (detail: string): void => {
    applyLifecycleEvent({ type: 'go-away.received' });
    logRuntimeDiagnostic('session', 'go-away state entered', { detail });
    failPendingAssistantTurn('Session unavailable');
    cleanupTransport();
    const store = dependencies.store.getState();
    store.setAssistantActivity('idle');
    store.setActiveTransport(null);
    store.setLastRuntimeError(detail);
  };

  const setErrorState = (
    detail: string,
    failedTurnStatusLabel = 'Disconnected',
  ): void => {
    applyLifecycleEvent({ type: 'runtime.failed' });
    logRuntimeError('session', 'runtime entered error state', { detail });
    failPendingAssistantTurn(failedTurnStatusLabel);
    cleanupTransport();
    const store = dependencies.store.getState();
    store.setAssistantActivity('idle');
    store.setActiveTransport(null);
    store.setLastRuntimeError(detail);
  };

  const handleTransportEvent = (event: LiveSessionEvent): void => {
    const store = dependencies.store.getState();

    dependencies.logger.onTransportEvent(event);
    store.setLastDebugEvent(
      createDebugEvent(
        'transport',
        event.type,
        'detail' in event ? event.detail : undefined,
      ),
    );

    if (event.type === 'connection-state-changed') {
      if (event.state === 'connecting') {
        applyLifecycleEvent({ type: 'bootstrap.started' });
        return;
      }

      if (event.state === 'connected') {
        applyLifecycleEvent({ type: 'transport.connected' });
        store.setAssistantActivity('idle');
        return;
      }

      applyLifecycleEvent({ type: 'transport.disconnected' });
      cleanupTransport();
      store.setAssistantActivity('idle');
      store.setActiveTransport(null);
      return;
    }

    if (event.type === 'text-delta') {
      applyLifecycleEvent({ type: 'response.delta.received' });
      appendAssistantTextDelta(event.text);
      return;
    }

    if (event.type === 'text-message') {
      upsertAssistantMessage(event.text, 'streaming', 'Responding...');
      return;
    }

    if (event.type === 'generation-complete') {
      applyLifecycleEvent({ type: 'response.generation.completed' });

      if (pendingAssistantTurnId) {
        const currentTurn = getConversationTurn(pendingAssistantTurnId);

        if (currentTurn) {
          updatePendingAssistantTurn(
            currentTurn.content,
            'streaming',
            'Finishing response...',
          );
        }
      }

      return;
    }

    if (event.type === 'interrupted') {
      applyLifecycleEvent({ type: 'response.interrupted' });
      markPendingAssistantTurnInterrupted();
      return;
    }

    if (event.type === 'turn-complete') {
      const previousStatus = currentTextSessionStatus();
      releaseTextChatStream();
      applyLifecycleEvent({ type: 'response.turn.completed' });
      completePendingAssistantTurn(
        previousStatus === 'interrupted' ? 'Interrupted' : undefined,
      );
      store.setAssistantActivity('idle');
      return;
    }

    if (event.type === 'go-away') {
      setGoAwayState(event.detail ?? 'Text session unavailable');
      return;
    }

    if (event.type === 'error') {
      setErrorState(event.detail);
    }
  };

  const handleTextChatStreamEvent = (event: TextChatStreamEvent): void => {
    if (event.type === 'text-delta') {
      handleTransportEvent({ type: 'text-delta', text: event.text });
      return;
    }

    if (event.type === 'completed') {
      handleTransportEvent({ type: 'turn-complete' });
      return;
    }

    dependencies.logger.onTransportEvent({ type: 'error', detail: event.detail });
    dependencies.store
      .getState()
      .setLastDebugEvent(createDebugEvent('transport', 'error', event.detail));
    releaseTextChatStream();
    setErrorState(event.detail, 'Response failed');
  };

  const appendUserTurn = (content: string): void => {
    dependencies.store.getState().appendConversationTurn({
      id: `user-turn-${++nextUserTurnId}`,
      role: 'user',
      content,
      timestamp: formatConversationTimestamp(),
      state: 'complete',
    });
  };

  const buildTextChatRequest = (text: string): TextChatRequest => {
    const messages: TextChatMessage[] = dependencies.store
      .getState()
      .conversationTurns
      .filter(
        (turn) =>
          (turn.role === 'user' || turn.role === 'assistant') &&
          turn.content.trim().length > 0 &&
          turn.state !== 'error',
      )
      .map((turn) => ({
        role: turn.role === 'assistant' ? 'assistant' : 'user',
        content: turn.content,
      }));

    messages.push({
      role: 'user',
      content: text,
    });

    return { messages };
  };

  const ensureTextSessionReady = async (): Promise<boolean> => {
    if (currentTextSessionStatus() === 'ready' || currentTextSessionStatus() === 'completed') {
      return true;
    }

    await startSessionInternal({ mode: 'text' });

    return (
      currentTextSessionStatus() === 'ready' ||
      currentTextSessionStatus() === 'completed'
    );
  };

  const startSessionInternal = async ({
    mode,
  }: {
    mode: SessionMode;
  }): Promise<void> => {
    if (mode === 'voice') {
      setErrorState(VOICE_MODE_UNAVAILABLE_DETAIL, 'Voice unavailable');
      return;
    }

    const status = currentTextSessionStatus();

    if (!isTextSessionConnectable(status) && isSessionActiveLifecycle(status)) {
      return;
    }

    const operationId = beginSessionOperation();
    resetRuntimeState();
    applyLifecycleEvent({ type: 'bootstrap.started' });
    recordSessionEvent({
      type: 'session.start.requested',
      transport: TEXT_CHAT_ADAPTER_KEY,
    });
    logRuntimeDiagnostic('session', 'start requested', {
      mode,
      transport: TEXT_CHAT_ADAPTER_KEY,
    });

    const isHealthy = await performBackendHealthCheck(operationId);

    if (!isHealthy || !isCurrentSessionOperation(operationId)) {
      return;
    }

    applyLifecycleEvent({ type: 'transport.connected' });
    dependencies.store.getState().setActiveTransport(TEXT_CHAT_ADAPTER_KEY);
    dependencies.store.getState().setAssistantActivity('idle');
    dependencies.store.getState().setLastRuntimeError(null);
  };

  const performBackendHealthCheck = async (operationId?: number): Promise<boolean> => {
    const store = dependencies.store.getState();

    recordSessionEvent({ type: 'session.backend.health.started' });
    store.setBackendState('checking');

    try {
      const isHealthy = await dependencies.checkBackendHealth();

      if (operationId && !isCurrentSessionOperation(operationId)) {
        return false;
      }

      if (!isHealthy) {
        const detail = 'Backend health check failed';
        store.setBackendState('failed');
        store.setLastRuntimeError(detail);
        applyLifecycleEvent({ type: 'runtime.failed' });
        recordSessionEvent({ type: 'session.backend.health.failed', detail });
        return false;
      }

      store.setBackendState('connected');
      recordSessionEvent({ type: 'session.backend.health.succeeded' });
      return true;
    } catch (error) {
      if (operationId && !isCurrentSessionOperation(operationId)) {
        return false;
      }

      const detail = asErrorDetail(error, 'Backend health check failed');
      store.setBackendState('failed');
      store.setLastRuntimeError(detail);
      applyLifecycleEvent({ type: 'runtime.failed' });
      recordSessionEvent({ type: 'session.backend.health.failed', detail });
      return false;
    }
  };

  return {
    checkBackendHealth: async () => {
      await performBackendHealthCheck();
    },
    startSession: async ({ mode }) => {
      await startSessionInternal({ mode });
    },
    submitTextTurn: async (text: string) => {
      const trimmedText = text.trim();

      if (!trimmedText) {
        return false;
      }

      if (isTextTurnInFlight(currentTextSessionStatus())) {
        return false;
      }

      const isReady = await ensureTextSessionReady();

      if (!isReady) {
        logRuntimeError('session', 'submit aborted because text chat is unavailable', {
          textLength: trimmedText.length,
        });
        return false;
      }

      applyLifecycleEvent({ type: 'submit.started' });

      try {
        activeTextChatStream = await dependencies.startTextChatStream(
          buildTextChatRequest(trimmedText),
          handleTextChatStreamEvent,
        );
      } catch (error) {
        setErrorState(asErrorDetail(error, 'Failed to start text chat'), 'Response failed');
        return false;
      }

      appendUserTurn(trimmedText);
      logRuntimeDiagnostic('session', 'text turn submitted', {
        textLength: trimmedText.length,
      });
      dependencies.store.getState().setLastRuntimeError(null);
      return true;
    },
    endSession: async () => {
      const store = dependencies.store.getState();
      beginSessionOperation();

      recordSessionEvent({ type: 'session.end.requested' });

      if (!activeTransport && !activeTextChatStream) {
        resetRuntimeState('disconnected');
        recordSessionEvent({ type: 'session.ended' });
        return;
      }

      applyLifecycleEvent({ type: 'disconnect.requested' });

      try {
        await activeTransport?.disconnect();
      } finally {
        cleanupTransport();
        resetRuntimeState('disconnected');
        store.setAssistantActivity('idle');
        recordSessionEvent({ type: 'session.ended' });
      }
    },
    setAssistantState: (assistantState: DebugAssistantState) => {
      dependencies.store.getState().setAssistantState(assistantState);
      recordSessionEvent({
        type: 'session.debug.state.set',
        detail: assistantState,
      });
    },
  };
}

let desktopSessionController: DesktopSessionController | null = null;

export function getDesktopSessionController(): DesktopSessionController {
  if (!desktopSessionController) {
    desktopSessionController = createDesktopSessionController();
  }

  return desktopSessionController;
}

export function resetDesktopSessionController(): void {
  desktopSessionController = null;
}
