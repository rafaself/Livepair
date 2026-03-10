import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDesktopSessionController } from './sessionController';
import type {
  DesktopSessionTransport,
  RuntimeLogger,
  TransportEvent,
} from './types';
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
  transport: DesktopSessionTransport;
  emit: (event: TransportEvent) => void;
} {
  let listener: ((event: TransportEvent) => void) | null = null;

  return {
    transport: {
      kind: 'gemini-live',
      connect: vi.fn(async () => {
        listener?.({ type: 'transport.lifecycle', state: 'connecting' });
        listener?.({ type: 'transport.lifecycle', state: 'connected' });
      }),
      disconnect: vi.fn(async () => {
        listener?.({ type: 'transport.lifecycle', state: 'disconnected' });
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

  it('starts a gemini-live runtime session and derives UI state from runtime fields', async () => {
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

    await controller.startSession();
    transportHarness.emit({
      type: 'assistant.activity',
      activity: 'listening',
    });
    transportHarness.emit({
      type: 'conversation.turn.appended',
      turn: {
        id: 'turn-1',
        role: 'assistant',
        content: 'Runtime connected.',
        timestamp: '09:45',
        state: 'complete',
      },
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
    expect(selectAssistantRuntimeState(useSessionStore.getState())).toBe('listening');
    expect(selectIsConversationEmpty(useSessionStore.getState())).toBe(false);
    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'turn-1',
        content: 'Runtime connected.',
      }),
    ]);
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

    await controller.startSession();

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        sessionPhase: 'error',
        tokenRequestState: 'error',
        transportState: 'idle',
        lastRuntimeError: 'token failed',
      }),
    );
    expect(selectAssistantRuntimeState(useSessionStore.getState())).toBe('error');
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

    await controller.startSession();
    transportHarness.emit({
      type: 'conversation.turn.appended',
      turn: {
        id: 'turn-1',
        role: 'assistant',
        content: 'Runtime connected.',
        timestamp: '09:45',
        state: 'complete',
      },
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

    const startPromise = controller.startSession();
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

  it('maps transport failures into a recoverable runtime error state', async () => {
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

    await controller.startSession();
    transportHarness.emit({
      type: 'transport.lifecycle',
      state: 'error',
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
});
