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
        expireTime: 'later',
        newSessionExpireTime: 'soon',
      }),
      createTransport: vi.fn((_kind: 'gemini-live') => transportHarness.transport),
    });

    await controller.startSession({ mode: 'text' });

    expect(transportHarness.transport.connect).toHaveBeenCalledWith({
      token: {
        token: 'ephemeral-token',
        expireTime: 'later',
        newSessionExpireTime: 'soon',
      },
      mode: 'text',
    });
    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
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
        sessionPhase: 'error',
        tokenRequestState: 'error',
        transportState: 'error',
        lastRuntimeError: 'token failed',
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
        expireTime: 'later',
        newSessionExpireTime: 'soon',
      }),
      createTransport: vi.fn().mockReturnValue(transportHarness.transport),
    });

    await controller.submitTextTurn('Summarize the current screen');

    expect(transportHarness.transport.connect).toHaveBeenCalledTimes(1);
    expect(transportHarness.transport.connect).toHaveBeenCalledWith({
      token: {
        token: 'ephemeral-token',
        expireTime: 'later',
        newSessionExpireTime: 'soon',
      },
      mode: 'text',
    });
    expect(transportHarness.transport.sendText).toHaveBeenCalledWith(
      'Summarize the current screen',
    );
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
    transportHarness.emit({
      type: 'text-delta',
      text: ' the current screen summary.',
    });
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
    expect(selectAssistantRuntimeState(useSessionStore.getState())).toBe('ready');
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
        expireTime: 'later',
        newSessionExpireTime: 'soon',
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
        expireTime: 'later',
        newSessionExpireTime: 'soon',
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
        expireTime: 'later',
        newSessionExpireTime: 'soon',
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

  it('handles interrupted and turn-complete events at the contract boundary', async () => {
    const transportHarness = createTransportHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'ephemeral-token',
        expireTime: 'later',
        newSessionExpireTime: 'soon',
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

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Summarize the current screen',
      }),
      expect.objectContaining({
        role: 'assistant',
        content: 'Partial response',
        state: 'complete',
        statusLabel: 'Interrupted',
      }),
    ]);
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
        expireTime: 'later',
        newSessionExpireTime: 'soon',
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

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Summarize the current screen',
      }),
      expect.objectContaining({
        role: 'assistant',
        content: 'Partial response',
        state: 'error',
        statusLabel: 'Disconnected',
      }),
    ]);
    expect(useSessionStore.getState().lastRuntimeError).toBe('transport offline');
  });
});
