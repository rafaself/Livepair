import { checkBackendHealth, requestSessionToken } from '../api/backend';
import { useSessionStore } from '../store/sessionStore';
import { defaultRuntimeLogger } from './logger';
import { createDesktopSessionTransport } from './mockTransport';
import type {
  DesktopSessionTransport,
  RuntimeLogger,
  SessionEvent,
  TransportEvent,
  TransportKind,
} from './types';

type SessionStoreApi = Pick<typeof useSessionStore, 'getState'>;
type DebugAssistantState = Parameters<
  ReturnType<SessionStoreApi['getState']>['setAssistantState']
>[0];

export type DesktopSessionController = {
  checkBackendHealth: () => Promise<void>;
  startSession: () => Promise<void>;
  endSession: () => Promise<void>;
  setAssistantState: (assistantState: DebugAssistantState) => void;
};

export type DesktopSessionControllerDependencies = {
  logger: RuntimeLogger;
  checkBackendHealth: typeof checkBackendHealth;
  requestSessionToken: typeof requestSessionToken;
  createTransport: (kind: TransportKind) => DesktopSessionTransport;
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
    createTransport: createDesktopSessionTransport,
    store: useSessionStore,
    ...overrides,
  };

  let activeTransport: DesktopSessionTransport | null = null;
  let unsubscribeTransport: (() => void) | null = null;
  let sessionOperationId = 0;

  const recordSessionEvent = (event: SessionEvent): void => {
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

  const cleanupTransport = (): void => {
    unsubscribeTransport?.();
    unsubscribeTransport = null;
    activeTransport = null;
  };

  const beginSessionOperation = (): number => {
    sessionOperationId += 1;
    return sessionOperationId;
  };

  const isCurrentSessionOperation = (operationId: number): boolean =>
    operationId === sessionOperationId;

  const handleTransportEvent = (event: TransportEvent): void => {
    const store = dependencies.store.getState();

    dependencies.logger.onTransportEvent(event);
    store.setLastDebugEvent(
      createDebugEvent(
        'transport',
        event.type,
        'detail' in event
          ? event.detail
          : 'activity' in event
            ? event.activity
            : undefined,
      ),
    );

    if (event.type === 'transport.lifecycle') {
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

      if (event.state === 'disconnected') {
        cleanupTransport();
        store.setTransportState('idle');
        store.setAssistantActivity('idle');
        store.setActiveTransport(null);

        if (store.sessionPhase !== 'ending') {
          store.setSessionPhase('idle');
        }

        return;
      }

      store.setTransportState('error');
      store.setSessionPhase('error');
      store.setAssistantActivity('idle');
      store.setLastRuntimeError(event.detail ?? 'Transport failed');
      cleanupTransport();
      return;
    }

    if (event.type === 'assistant.activity') {
      store.setSessionPhase('active');

      if (event.activity === 'ready') {
        store.setAssistantActivity('idle');
        return;
      }

      store.setAssistantActivity(event.activity);
      return;
    }

    if (event.type === 'conversation.turn.appended') {
      store.appendConversationTurn(event.turn);
      return;
    }

    store.updateConversationTurn(event.turnId, {
      content: event.content,
      state: event.state,
      statusLabel: event.statusLabel,
    });
  };

  const setErrorState = (detail: string): void => {
    cleanupTransport();
    const store = dependencies.store.getState();
    store.setSessionPhase('error');
    store.setAssistantActivity('idle');
    store.setTransportState('idle');
    store.setActiveTransport(null);
    store.setLastRuntimeError(detail);
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
    startSession: async () => {
      const store = dependencies.store.getState();

      if (store.sessionPhase === 'starting' || store.sessionPhase === 'active') {
        return;
      }

      const operationId = beginSessionOperation();
      store.reset();
      store.setSessionPhase('starting');
      store.setActiveTransport('mock');
      recordSessionEvent({ type: 'session.start.requested', transport: 'mock' });

      const isHealthy = await performBackendHealthCheck(operationId);

      if (!isHealthy || !isCurrentSessionOperation(operationId)) {
        return;
      }

      store.setTokenRequestState('loading');
      recordSessionEvent({ type: 'session.token.request.started' });

      try {
        const token = await dependencies.requestSessionToken({});

        if (!isCurrentSessionOperation(operationId)) {
          return;
        }

        store.setTokenRequestState('success');
        recordSessionEvent({ type: 'session.token.request.succeeded', transport: 'mock' });

        activeTransport = dependencies.createTransport('mock');
        unsubscribeTransport = activeTransport.subscribe(handleTransportEvent);
        store.setTransportState('connecting');
        await activeTransport.connect({ token });
      } catch (error) {
        if (!isCurrentSessionOperation(operationId)) {
          return;
        }

        const detail = asErrorDetail(error, 'Token request failed');
        store.setTokenRequestState('error');
        recordSessionEvent({ type: 'session.token.request.failed', detail });
        setErrorState(detail);
      }
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
