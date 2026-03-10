import { checkBackendHealth, requestSessionToken } from '../api/backend';
import { useSessionStore } from '../store/sessionStore';
import { LIVE_ADAPTER_KEY } from './liveConfig';
import { defaultRuntimeLogger } from './logger';
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
    requestSessionToken,
    createTransport: (_kind) => createGeminiLiveTransport(),
    store: useSessionStore,
    ...overrides,
  };

  let activeTransport: DesktopSession | null = null;
  let unsubscribeTransport: (() => void) | null = null;
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
    const nextLifecycle = reduceTextSessionLifecycle(store.textSessionLifecycle, event);

    if (nextLifecycle !== store.textSessionLifecycle) {
      store.setTextSessionLifecycle(nextLifecycle);
    }

    return nextLifecycle.status;
  };

  const cleanupTransport = (): void => {
    unsubscribeTransport?.();
    unsubscribeTransport = null;
    activeTransport = null;
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
    failPendingAssistantTurn('Session unavailable');
    cleanupTransport();
    const store = dependencies.store.getState();
    store.setAssistantActivity('idle');
    store.setActiveTransport(null);
    store.setLastRuntimeError(detail);
  };

  const setErrorState = (detail: string): void => {
    applyLifecycleEvent({ type: 'runtime.failed' });
    failPendingAssistantTurn('Disconnected');
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

  const appendUserTurn = (content: string): void => {
    dependencies.store.getState().appendConversationTurn({
      id: `user-turn-${++nextUserTurnId}`,
      role: 'user',
      content,
      timestamp: formatConversationTimestamp(),
      state: 'complete',
    });
  };

  const ensureConnectedTransport = async (): Promise<DesktopSession | null> => {
    if (
      activeTransport &&
      (currentTextSessionStatus() === 'ready' ||
        currentTextSessionStatus() === 'completed')
    ) {
      return activeTransport;
    }

    await startSessionInternal({ mode: 'text' });

    if (
      !activeTransport ||
      (currentTextSessionStatus() !== 'ready' &&
        currentTextSessionStatus() !== 'completed')
    ) {
      return null;
    }

    return activeTransport;
  };

  const startSessionInternal = async ({
    mode,
  }: {
    mode: SessionMode;
  }): Promise<void> => {
    const status = currentTextSessionStatus();

    if (!isTextSessionConnectable(status) && isSessionActiveLifecycle(status)) {
      return;
    }

    const operationId = beginSessionOperation();
    resetRuntimeState();
    applyLifecycleEvent({ type: 'bootstrap.started' });
    recordSessionEvent({ type: 'session.start.requested', transport: LIVE_ADAPTER_KEY });

    const isHealthy = await performBackendHealthCheck(operationId);

    if (!isHealthy || !isCurrentSessionOperation(operationId)) {
      return;
    }

    dependencies.store.getState().setTokenRequestState('loading');
    applyLifecycleEvent({ type: 'bootstrap.started' });
    recordSessionEvent({ type: 'session.token.request.started' });

    let token;
    try {
      token = await dependencies.requestSessionToken({});

      if (!isCurrentSessionOperation(operationId)) {
        return;
      }

      dependencies.store.getState().setTokenRequestState('success');
      recordSessionEvent({
        type: 'session.token.request.succeeded',
        transport: LIVE_ADAPTER_KEY,
      });
    } catch (error) {
      if (!isCurrentSessionOperation(operationId)) {
        return;
      }

      const detail = asErrorDetail(error, 'Token request failed');
      dependencies.store.getState().setTokenRequestState('error');
      recordSessionEvent({ type: 'session.token.request.failed', detail });
      setErrorState(detail);
      return;
    }

    activeTransport = dependencies.createTransport(LIVE_ADAPTER_KEY);
    unsubscribeTransport = activeTransport.subscribe(handleTransportEvent);
    dependencies.store.getState().setActiveTransport(LIVE_ADAPTER_KEY);
    applyLifecycleEvent({ type: 'bootstrap.started' });

    try {
      await activeTransport.connect({ token, mode });
    } catch (error) {
      if (!isCurrentSessionOperation(operationId)) {
        return;
      }

      if (currentTextSessionStatus() === 'goAway') {
        return;
      }

      if (currentTextSessionStatus() === 'error') {
        return;
      }

      setErrorState(asErrorDetail(error, 'Gemini Live connection failed'));
    }
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

      const transport = await ensureConnectedTransport();

      if (!transport) {
        return false;
      }

      applyLifecycleEvent({ type: 'submit.started' });

      try {
        await transport.sendText(trimmedText);
      } catch (error) {
        setErrorState(asErrorDetail(error, 'Failed to send text turn'));
        return false;
      }

      appendUserTurn(trimmedText);
      dependencies.store.getState().setLastRuntimeError(null);
      return true;
    },
    endSession: async () => {
      const store = dependencies.store.getState();
      beginSessionOperation();

      recordSessionEvent({ type: 'session.end.requested' });

      if (!activeTransport) {
        resetRuntimeState('disconnected');
        recordSessionEvent({ type: 'session.ended' });
        return;
      }

      applyLifecycleEvent({ type: 'disconnect.requested' });

      try {
        await activeTransport.disconnect();
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
