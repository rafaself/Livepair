import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDesktopSessionController } from './sessionController';
import type { DesktopSession, LiveSessionEvent, RuntimeLogger } from './types';
import {
  selectAssistantRuntimeState,
  selectIsConversationEmpty,
} from './selectors';
import { useSessionStore } from '../store/sessionStore';

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

async function flushMicrotasks(times = 1): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

function createTransportHarness(): {
  transport: DesktopSession;
  emit: (event: LiveSessionEvent) => void;
} {
  let listener: ((event: LiveSessionEvent) => void) | null = null;

  return {
    transport: {
      kind: 'gemini-live',
      connect: vi.fn(async () => {
        listener?.({ type: 'connection-state-changed', state: 'connecting' });
        listener?.({ type: 'connection-state-changed', state: 'connected' });
      }),
      sendText: vi.fn(async () => {}),
      sendAudioChunk: vi.fn(async () => {}),
      disconnect: vi.fn(async () => {
        listener?.({ type: 'connection-state-changed', state: 'disconnected' });
      }),
      subscribe: vi.fn((nextListener) => {
        listener = nextListener;

        return () => {
          listener = null;
        };
      }),
    },
    emit: (event) => {
      listener?.(event);
    },
  };
}

describe('createDesktopSessionController', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  it('starts a text-mode runtime session and derives UI state from internal session events', async () => {
    const transportHarness = createTransportHarness();
    const logger: RuntimeLogger = {
      onSessionEvent: vi.fn(),
      onTransportEvent: vi.fn(),
    };
    const controller = createDesktopSessionController({
      logger,
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'ephemeral-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn((_kind: 'gemini-live') => transportHarness.transport),
    });

    await controller.startSession({ mode: 'text' });

    expect(transportHarness.transport.connect).toHaveBeenCalledWith({
      token: {
        token: 'ephemeral-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      },
      mode: 'text',
    });
    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        textSessionLifecycle: expect.objectContaining({
          status: 'ready',
        }),
        sessionPhase: 'active',
        backendState: 'connected',
        tokenRequestState: 'success',
        transportState: 'connected',
        activeTransport: 'gemini-live',
      }),
    );
    expect(selectAssistantRuntimeState(useSessionStore.getState())).toBe('ready');
    expect(selectIsConversationEmpty(useSessionStore.getState())).toBe(true);
    expect(logger.onSessionEvent).toHaveBeenCalled();
    expect(logger.onTransportEvent).toHaveBeenCalled();
  });

  it('waits for the token request to finish before opening the live transport', async () => {
    const transportHarness = createTransportHarness();
    const deferredToken = createDeferred<{
      token: string;
      expireTime: string;
      newSessionExpireTime: string;
    }>();
    const requestSessionToken = vi.fn().mockReturnValue(deferredToken.promise);
    const createTransport = vi.fn((_kind: 'gemini-live') => transportHarness.transport);
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken,
      createTransport,
    });

    const startPromise = controller.startSession({ mode: 'text' });
    await flushMicrotasks(2);

    expect(requestSessionToken).toHaveBeenCalledTimes(1);
    expect(createTransport).not.toHaveBeenCalled();
    expect(transportHarness.transport.connect).not.toHaveBeenCalled();

    deferredToken.resolve({
      token: 'ephemeral-token',
      expireTime: '2026-03-09T12:30:00.000Z',
      newSessionExpireTime: '2026-03-09T12:01:30.000Z',
    });
    await startPromise;

    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(transportHarness.transport.connect).toHaveBeenCalledTimes(1);
  });

  it('maps token request failures into runtime error state', async () => {
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken: vi.fn().mockRejectedValue(new Error('token failed')),
      createTransport: vi.fn(),
    });

    await controller.startSession({ mode: 'text' });

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        textSessionLifecycle: expect.objectContaining({
          status: 'error',
        }),
        sessionPhase: 'error',
        tokenRequestState: 'error',
        transportState: 'error',
        lastRuntimeError: 'token failed',
      }),
    );
    expect(selectAssistantRuntimeState(useSessionStore.getState())).toBe('error');
  });

  it('maps invalid token bootstrap responses into runtime error state', async () => {
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken: vi.fn().mockRejectedValue(
        new Error('Token response was invalid'),
      ),
      createTransport: vi.fn(),
    });

    await controller.startSession({ mode: 'text' });

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        textSessionLifecycle: expect.objectContaining({
          status: 'error',
        }),
        sessionPhase: 'error',
        tokenRequestState: 'error',
        transportState: 'error',
        lastRuntimeError: 'Token response was invalid',
      }),
    );
  });

  it('maps adapter bootstrap failures into runtime error state', async () => {
    const transportHarness = createTransportHarness();
    transportHarness.transport.connect = vi.fn().mockRejectedValue(
      new Error(
        'Invalid Live config: Gemini Live ephemeral-token sessions require VITE_LIVE_API_VERSION to be "v1alpha"',
      ),
    );
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'ephemeral-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn().mockReturnValue(transportHarness.transport),
    });

    await controller.startSession({ mode: 'text' });

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        textSessionLifecycle: expect.objectContaining({
          status: 'error',
        }),
        sessionPhase: 'error',
        tokenRequestState: 'success',
        transportState: 'error',
        activeTransport: null,
        lastRuntimeError:
          'Invalid Live config: Gemini Live ephemeral-token sessions require VITE_LIVE_API_VERSION to be "v1alpha"',
      }),
    );
    expect(selectAssistantRuntimeState(useSessionStore.getState())).toBe('error');
  });

  it('auto-starts text mode, sends user text, and stores streamed assistant text through the contract', async () => {
    const transportHarness = createTransportHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'ephemeral-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn().mockReturnValue(transportHarness.transport),
    });

    await controller.submitTextTurn('Summarize the current screen');

    expect(transportHarness.transport.connect).toHaveBeenCalledTimes(1);
    expect(transportHarness.transport.connect).toHaveBeenCalledWith({
      token: {
        token: 'ephemeral-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      },
      mode: 'text',
    });
    expect(transportHarness.transport.sendText).toHaveBeenCalledWith(
      'Summarize the current screen',
    );
    expect(useSessionStore.getState().textSessionLifecycle.status).toBe('sending');
    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Summarize the current screen',
        state: 'complete',
      }),
    ]);
    expect(selectAssistantRuntimeState(useSessionStore.getState())).toBe('thinking');

    transportHarness.emit({
      type: 'text-delta',
      text: 'Here is',
    });
    expect(useSessionStore.getState().textSessionLifecycle.status).toBe('receiving');
    transportHarness.emit({
      type: 'text-delta',
      text: ' the current screen summary.',
    });
    transportHarness.emit({
      type: 'generation-complete',
    });
    expect(useSessionStore.getState().textSessionLifecycle.status).toBe(
      'generationCompleted',
    );
    transportHarness.emit({
      type: 'text-message',
      text: 'Here is the current screen summary.',
    });
    transportHarness.emit({
      type: 'turn-complete',
    });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Summarize the current screen',
      }),
      expect.objectContaining({
        role: 'assistant',
        content: 'Here is the current screen summary.',
        state: 'complete',
      }),
    ]);
    expect(useSessionStore.getState().textSessionLifecycle.status).toBe('completed');
    expect(selectAssistantRuntimeState(useSessionStore.getState())).toBe('ready');
  });

  it('waits for readiness before sending the first text turn', async () => {
    let listener: ((event: LiveSessionEvent) => void) | null = null;
    const connectDeferred = createDeferred<void>();
    const emit = (event: LiveSessionEvent): void => {
      const currentListener = listener as ((event: LiveSessionEvent) => void) | null;
      currentListener?.(event);
    };
    const transport: DesktopSession = {
      kind: 'gemini-live',
      connect: vi.fn(async () => {
        emit({ type: 'connection-state-changed', state: 'connecting' });
        await connectDeferred.promise;
      }),
      sendText: vi.fn(async () => {}),
      sendAudioChunk: vi.fn(async () => {}),
      disconnect: vi.fn(async () => {
        emit({ type: 'connection-state-changed', state: 'disconnected' });
      }),
      subscribe: vi.fn((nextListener) => {
        listener = nextListener;

        return () => {
          listener = null;
        };
      }),
    };
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'ephemeral-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn().mockReturnValue(transport),
    });

    const submitPromise = controller.submitTextTurn('Wait until ready');
    await flushMicrotasks(2);

    expect(useSessionStore.getState().textSessionLifecycle.status).toBe('connecting');
    expect(transport.sendText).not.toHaveBeenCalled();

    emit({ type: 'connection-state-changed', state: 'connected' });
    connectDeferred.resolve();
    await submitPromise;

    expect(transport.sendText).toHaveBeenCalledWith('Wait until ready');
    expect(useSessionStore.getState().textSessionLifecycle.status).toBe('sending');
  });

  it('blocks a second submit while the current text turn is still in flight', async () => {
    const sendDeferred = createDeferred<void>();
    const transportHarness = createTransportHarness();
    transportHarness.transport.sendText = vi.fn(async () => {
      await sendDeferred.promise;
    });
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'ephemeral-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn().mockReturnValue(transportHarness.transport),
    });

    await controller.startSession({ mode: 'text' });
    const firstSubmit = controller.submitTextTurn('First turn');
    await flushMicrotasks(2);

    expect(transportHarness.transport.sendText).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().textSessionLifecycle.status).toBe('sending');

    const secondDidSend = await controller.submitTextTurn('Second turn');
    expect(secondDidSend).toBe(false);

    sendDeferred.resolve();
    await firstSubmit;
    expect(transportHarness.transport.sendText).toHaveBeenCalledTimes(1);
  });

  it('does not append a user turn when submitTextTurn cannot start a session', async () => {
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken: vi.fn().mockRejectedValue(new Error('token failed')),
      createTransport: vi.fn(),
    });

    await controller.submitTextTurn('Summarize the current screen');

    expect(useSessionStore.getState().conversationTurns).toEqual([]);
    expect(useSessionStore.getState().lastRuntimeError).toBe('token failed');
  });

  it('resets runtime state and turns when the session ends', async () => {
    const transportHarness = createTransportHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'ephemeral-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn().mockReturnValue(transportHarness.transport),
    });

    await controller.startSession({ mode: 'text' });
    transportHarness.emit({
      type: 'text-message',
      text: 'Runtime connected.',
    });
    transportHarness.emit({
      type: 'turn-complete',
    });

    await controller.endSession();

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        textSessionLifecycle: expect.objectContaining({
          status: 'disconnected',
        }),
        sessionPhase: 'idle',
        backendState: 'idle',
        tokenRequestState: 'idle',
        transportState: 'idle',
        activeTransport: null,
        conversationTurns: [],
        lastRuntimeError: null,
      }),
    );
    expect(selectAssistantRuntimeState(useSessionStore.getState())).toBe('disconnected');
    expect(selectIsConversationEmpty(useSessionStore.getState())).toBe(true);
  });

  it('cancels an in-flight start when the session is ended mid-request', async () => {
    const backendHealth = createDeferred<boolean>();
    const createTransport = vi.fn((_kind: 'gemini-live') => createTransportHarness().transport);
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockImplementation(() => backendHealth.promise),
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'ephemeral-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport,
    });

    const startPromise = controller.startSession({ mode: 'text' });
    await controller.endSession();
    backendHealth.resolve(true);
    await startPromise;

    expect(createTransport).not.toHaveBeenCalled();
    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        textSessionLifecycle: expect.objectContaining({
          status: 'disconnected',
        }),
        sessionPhase: 'idle',
        backendState: 'idle',
        tokenRequestState: 'idle',
        transportState: 'idle',
      }),
    );
  });

  it('maps transport errors into a recoverable runtime error state', async () => {
    const transportHarness = createTransportHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'ephemeral-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn().mockReturnValue(transportHarness.transport),
    });

    await controller.startSession({ mode: 'text' });
    transportHarness.emit({
      type: 'error',
      detail: 'socket closed unexpectedly',
    });

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        textSessionLifecycle: expect.objectContaining({
          status: 'error',
        }),
        sessionPhase: 'error',
        tokenRequestState: 'success',
        transportState: 'error',
        activeTransport: null,
        lastRuntimeError: 'socket closed unexpectedly',
      }),
    );
    expect(selectAssistantRuntimeState(useSessionStore.getState())).toBe('error');
    expect(selectIsConversationEmpty(useSessionStore.getState())).toBe(true);
  });

  it('keeps interrupted turns explicit until turn completion arrives', async () => {
    const transportHarness = createTransportHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'ephemeral-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn().mockReturnValue(transportHarness.transport),
    });

    await controller.submitTextTurn('Summarize the current screen');
    transportHarness.emit({
      type: 'text-delta',
      text: 'Partial response',
    });
    transportHarness.emit({
      type: 'interrupted',
    });

    expect(useSessionStore.getState().textSessionLifecycle.status).toBe('interrupted');
    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Summarize the current screen',
      }),
      expect.objectContaining({
        role: 'assistant',
        content: 'Partial response',
        state: 'streaming',
        statusLabel: 'Interrupted',
      }),
    ]);
    expect(selectAssistantRuntimeState(useSessionStore.getState())).toBe('thinking');

    transportHarness.emit({
      type: 'turn-complete',
    });

    expect(useSessionStore.getState().textSessionLifecycle.status).toBe('completed');
    expect(useSessionStore.getState().conversationTurns.at(-1)).toEqual(
      expect.objectContaining({
        role: 'assistant',
        content: 'Partial response',
        state: 'complete',
        statusLabel: 'Interrupted',
      }),
    );
    expect(selectAssistantRuntimeState(useSessionStore.getState())).toBe('ready');

    await controller.submitTextTurn('Try again');
    transportHarness.emit({
      type: 'text-delta',
      text: 'Done',
    });
    transportHarness.emit({
      type: 'text-message',
      text: 'Done',
    });
    transportHarness.emit({
      type: 'turn-complete',
    });

    expect(useSessionStore.getState().conversationTurns.at(-1)).toEqual(
      expect.objectContaining({
        role: 'assistant',
        content: 'Done',
        state: 'complete',
      }),
    );
    expect(selectAssistantRuntimeState(useSessionStore.getState())).toBe('ready');
  });

  it('preserves partial assistant text and marks it failed on go-away', async () => {
    const transportHarness = createTransportHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'ephemeral-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn().mockReturnValue(transportHarness.transport),
    });

    await controller.submitTextTurn('Summarize the current screen');
    transportHarness.emit({
      type: 'text-delta',
      text: 'Partial response',
    });
    transportHarness.emit({
      type: 'go-away',
      detail: 'transport offline',
    });

    expect(useSessionStore.getState().textSessionLifecycle.status).toBe('goAway');
    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Summarize the current screen',
      }),
      expect.objectContaining({
        role: 'assistant',
        content: 'Partial response',
        state: 'error',
        statusLabel: 'Session unavailable',
      }),
    ]);
    expect(useSessionStore.getState().lastRuntimeError).toBe('transport offline');
  });

  it('starts a fresh session after go-away', async () => {
    const transportHarness = createTransportHarness();
    const createTransport = vi.fn().mockReturnValue(transportHarness.transport);
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'ephemeral-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport,
    });

    await controller.submitTextTurn('First turn');
    transportHarness.emit({
      type: 'go-away',
      detail: 'transport offline',
    });

    await controller.submitTextTurn('Second turn');

    expect(createTransport).toHaveBeenCalledTimes(2);
    expect(useSessionStore.getState().textSessionLifecycle.status).toBe('sending');
  });
});
