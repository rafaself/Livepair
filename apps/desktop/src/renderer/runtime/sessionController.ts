import { checkBackendHealth, requestSessionToken } from '../api/backend';
import { useSessionStore } from '../store/sessionStore';
import { defaultRuntimeLogger } from './logger';
import { formatConversationTimestamp } from './conversationTimestamp';
import { createGeminiLiveTransport } from './geminiLiveTransport';
import type {
  ConversationTurnModel,
  DesktopSession,
  LiveSessionEvent,
  RuntimeLogger,
  SessionControllerEvent,
  SessionMode,
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

  const upsertAssistantMessage = (text: string): void => {
    if (!pendingAssistantTurnId) {
      appendAssistantTurn(text, 'complete');
      return;
    }

    updatePendingAssistantTurn(text, 'complete');
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

  const setErrorState = (detail: string): void => {
    failPendingAssistantTurn('Disconnected');
    cleanupTransport();
    const store = dependencies.store.getState();
    store.setSessionPhase('error');
    store.setAssistantActivity('idle');
    store.setTransportState('error');
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
        store.setTransportState('connecting');
        return;
      }

      if (event.state === 'connected') {
        store.setTransportState('connected');
        store.setSessionPhase('active');
        store.setAssistantActivity('idle');
        return;
      }

      cleanupTransport();
      store.setTransportState('idle');
      store.setAssistantActivity('idle');
      store.setActiveTransport(null);

      if (store.sessionPhase !== 'ending') {
        store.setSessionPhase('idle');
      }

      return;
    }

    if (event.type === 'text-delta') {
      store.setSessionPhase('active');
      store.setAssistantActivity('thinking');
      appendAssistantTextDelta(event.text);
      return;
    }

    if (event.type === 'text-message') {
      store.setSessionPhase('active');
      upsertAssistantMessage(event.text);
      return;
    }

    if (event.type === 'interrupted') {
      completePendingAssistantTurn('Interrupted');
      store.setAssistantActivity('idle');
      return;
    }

    if (event.type === 'turn-complete') {
      completePendingAssistantTurn();
      store.setAssistantActivity('idle');
      return;
    }

    if (event.type === 'go-away' || event.type === 'error') {
      setErrorState(event.detail ?? 'Transport failed');
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
    const store = dependencies.store.getState();

    if (
      activeTransport &&
      store.transportState === 'connected' &&
      store.sessionPhase === 'active'
    ) {
      return activeTransport;
    }

    await startSessionInternal({ mode: 'text' });

    const nextStore = dependencies.store.getState();

    if (
      !activeTransport ||
      nextStore.transportState !== 'connected' ||
      nextStore.sessionPhase !== 'active'
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
    const store = dependencies.store.getState();

    if (store.sessionPhase === 'starting' || store.sessionPhase === 'active') {
      return;
    }

    const operationId = beginSessionOperation();
    store.reset();
    store.setSessionPhase('starting');
    recordSessionEvent({ type: 'session.start.requested', transport: 'gemini-live' });

    const isHealthy = await performBackendHealthCheck(operationId);

    if (!isHealthy || !isCurrentSessionOperation(operationId)) {
      return;
    }

    store.setTokenRequestState('loading');
    recordSessionEvent({ type: 'session.token.request.started' });

    let token;
    try {
      token = await dependencies.requestSessionToken({});

      if (!isCurrentSessionOperation(operationId)) {
        return;
      }

      store.setTokenRequestState('success');
      recordSessionEvent({
        type: 'session.token.request.succeeded',
        transport: 'gemini-live',
      });
    } catch (error) {
      if (!isCurrentSessionOperation(operationId)) {
        return;
      }

      const detail = asErrorDetail(error, 'Token request failed');
      store.setTokenRequestState('error');
      recordSessionEvent({ type: 'session.token.request.failed', detail });
      setErrorState(detail);
      return;
    }

    activeTransport = dependencies.createTransport('gemini-live');
    unsubscribeTransport = activeTransport.subscribe(handleTransportEvent);
    store.setActiveTransport('gemini-live');
    store.setTransportState('connecting');

    try {
      await activeTransport.connect({ token, mode });
    } catch (error) {
      if (!isCurrentSessionOperation(operationId)) {
        return;
      }

      if (dependencies.store.getState().sessionPhase === 'error') {
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
        store.setSessionPhase('error');
        store.setLastRuntimeError(detail);
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
      store.setSessionPhase('error');
      store.setLastRuntimeError(detail);
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

      const transport = await ensureConnectedTransport();

      if (!transport) {
        return false;
      }

      try {
        await transport.sendText(trimmedText);
      } catch (error) {
        setErrorState(asErrorDetail(error, 'Failed to send text turn'));
        return false;
      }

      const store = dependencies.store.getState();
      store.setLastRuntimeError(null);
      appendUserTurn(trimmedText);
      store.setAssistantActivity('thinking');
      return true;
    },
    endSession: async () => {
      const store = dependencies.store.getState();
      beginSessionOperation();

      recordSessionEvent({ type: 'session.end.requested' });

      if (!activeTransport) {
        store.reset();
        recordSessionEvent({ type: 'session.ended' });
        return;
      }

      store.setSessionPhase('ending');
      store.setTransportState('disconnecting');

      try {
        await activeTransport.disconnect();
      } finally {
        cleanupTransport();
        store.reset();
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

export async function resetDesktopSessionController(): Promise<void> {
  if (desktopSessionController) {
    await desktopSessionController.endSession();
  }

  desktopSessionController = null;
}
