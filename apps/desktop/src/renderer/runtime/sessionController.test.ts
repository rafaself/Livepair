import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TextChatRequest, TextChatStreamEvent } from '@livepair/shared-types';
import { createDesktopSessionController } from './sessionController';
import { selectAssistantRuntimeState, selectIsConversationEmpty } from './selectors';
import type {
  DesktopSession,
  LocalVoiceChunk,
  RuntimeLogger,
  VoiceCaptureDiagnostics,
} from './types';
import { useSessionStore } from '../store/sessionStore';
import { useSettingsStore } from '../store/settingsStore';
import { DEFAULT_DESKTOP_SETTINGS } from '../../shared/settings';

function createUnusedTransport(): DesktopSession {
  return {
    kind: 'gemini-live',
    connect: vi.fn(async () => undefined),
    sendText: vi.fn(async () => undefined),
    sendAudioChunk: vi.fn(async () => undefined),
    sendAudioStreamEnd: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    subscribe: vi.fn(() => vi.fn()),
  };
}

function createVoiceTransportHarness(): {
  transport: DesktopSession;
  connect: ReturnType<typeof vi.fn>;
  sendAudioChunk: ReturnType<typeof vi.fn>;
  sendAudioStreamEnd: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  emit: (event: Parameters<Parameters<DesktopSession['subscribe']>[0]>[0]) => void;
} {
  let listener: ((event: Parameters<Parameters<DesktopSession['subscribe']>[0]>[0]) => void)
    | null = null;
  const sendAudioChunk = vi.fn(async () => undefined);
  const sendAudioStreamEnd = vi.fn(async () => undefined);
  const disconnect = vi.fn(async () => {
    listener?.({ type: 'connection-state-changed', state: 'disconnected' });
  });
  const connect = vi.fn(async () => {
    listener?.({ type: 'connection-state-changed', state: 'connecting' });
    listener?.({ type: 'connection-state-changed', state: 'connected' });
  });

  return {
    transport: {
      kind: 'gemini-live',
      connect,
      sendText: vi.fn(async () => undefined),
      sendAudioChunk,
      sendAudioStreamEnd,
      disconnect,
      subscribe: vi.fn((nextListener) => {
        listener = nextListener;

        return () => {
          listener = null;
        };
      }),
    },
    connect,
    sendAudioChunk,
    sendAudioStreamEnd,
    disconnect,
    emit: (event) => {
      listener?.(event);
    },
  };
}

function createTextChatHarness(): {
  startTextChatStream: ReturnType<typeof vi.fn>;
  getLastRequest: () => TextChatRequest | null;
  emit: (event: TextChatStreamEvent) => void;
  cancel: ReturnType<typeof vi.fn>;
} {
  let lastRequest: TextChatRequest | null = null;
  let listener: ((event: TextChatStreamEvent) => void) | null = null;
  const cancel = vi.fn(async () => undefined);
  const startTextChatStream = vi.fn(
    async (request: TextChatRequest, onEvent: (event: TextChatStreamEvent) => void) => {
      lastRequest = request;
      listener = onEvent;
      return { cancel };
    },
  );

  return {
    startTextChatStream,
    getLastRequest: () => lastRequest,
    emit: (event) => {
      listener?.(event);
    },
    cancel,
  };
}

function createVoiceCaptureHarness(): {
  createVoiceCapture: ReturnType<typeof vi.fn>;
  emitChunk: (chunk?: Partial<LocalVoiceChunk>) => void;
  emitDiagnostics: (diagnostics: Partial<VoiceCaptureDiagnostics>) => void;
  emitError: (detail: string) => void;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
} {
  let observer:
    | {
        onChunk: (chunk: LocalVoiceChunk) => void;
        onDiagnostics: (diagnostics: Partial<VoiceCaptureDiagnostics>) => void;
        onError: (detail: string) => void;
      }
    | null = null;
  const start = vi.fn(async () => undefined);
  const stop = vi.fn(async () => undefined);

  return {
    createVoiceCapture: vi.fn((nextObserver) => {
      observer = nextObserver;

      return {
        start,
        stop,
      };
    }),
    emitChunk: (chunk = {}) => {
      observer?.onChunk({
        data: new Uint8Array(640).fill(1),
        sampleRateHz: 16_000,
        channels: 1,
        encoding: 'pcm_s16le',
        durationMs: 20,
        sequence: 1,
        ...chunk,
      });
    },
    emitDiagnostics: (diagnostics) => {
      observer?.onDiagnostics(diagnostics);
    },
    emitError: (detail) => {
      observer?.onError(detail);
    },
    start,
    stop,
  };
}

describe('createDesktopSessionController', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
    useSettingsStore.setState({
      settings: DEFAULT_DESKTOP_SETTINGS,
      isReady: true,
    });
  });

  it('starts text mode through backend health only and does not bootstrap Live', async () => {
    const textChat = createTextChatHarness();
    const requestSessionToken = vi.fn();
    const createTransport = vi.fn(() => createUnusedTransport());
    const logger: RuntimeLogger = {
      onSessionEvent: vi.fn(),
      onTransportEvent: vi.fn(),
    };
    const controller = createDesktopSessionController({
      logger,
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      startTextChatStream: textChat.startTextChatStream,
      requestSessionToken,
      createTransport,
    });

    await controller.startSession({ mode: 'text' });

    expect(requestSessionToken).not.toHaveBeenCalled();
    expect(createTransport).not.toHaveBeenCalled();
    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        textSessionLifecycle: expect.objectContaining({ status: 'ready' }),
        sessionPhase: 'active',
        backendState: 'connected',
        tokenRequestState: 'idle',
        transportState: 'connected',
        activeTransport: 'backend-text',
      }),
    );
    expect(selectAssistantRuntimeState(useSessionStore.getState())).toBe('ready');
    expect(selectIsConversationEmpty(useSessionStore.getState())).toBe(true);
    expect(logger.onSessionEvent).toHaveBeenCalledWith({
      type: 'session.start.requested',
      transport: 'backend-text',
    });
  });

  it('bootstraps a Gemini Live voice session with an ephemeral token', async () => {
    const voiceTransport = createVoiceTransportHarness();
    const requestSessionToken = vi.fn().mockResolvedValue({
      token: 'auth_tokens/test-token',
      expireTime: '2099-03-09T12:30:00.000Z',
      newSessionExpireTime: '2099-03-09T12:01:30.000Z',
    });
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn(),
      startTextChatStream: createTextChatHarness().startTextChatStream,
      requestSessionToken,
      createTransport: vi.fn(() => voiceTransport.transport),
    });

    await controller.startSession({ mode: 'voice' });

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        tokenRequestState: 'success',
        activeTransport: 'gemini-live',
        voiceSessionStatus: 'ready',
        lastRuntimeError: null,
      }),
    );
    expect(requestSessionToken).toHaveBeenCalledWith({});
    expect(voiceTransport.connect).toHaveBeenCalledWith({
      token: {
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      },
      mode: 'voice',
    });
  });

  it('auto-starts text mode, streams assistant text, and completes the turn', async () => {
    const textChat = createTextChatHarness();
    const requestSessionToken = vi.fn();
    const createTransport = vi.fn(() => createUnusedTransport());
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      startTextChatStream: textChat.startTextChatStream,
      requestSessionToken,
      createTransport,
    });

    await expect(controller.submitTextTurn('Summarize the current screen')).resolves.toBe(true);

    expect(requestSessionToken).not.toHaveBeenCalled();
    expect(createTransport).not.toHaveBeenCalled();
    expect(textChat.getLastRequest()).toEqual({
      messages: [{ role: 'user', content: 'Summarize the current screen' }],
    });
    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Summarize the current screen',
        state: 'complete',
      }),
    ]);
    expect(useSessionStore.getState().textSessionLifecycle.status).toBe('sending');
    expect(selectAssistantRuntimeState(useSessionStore.getState())).toBe('thinking');

    textChat.emit({ type: 'text-delta', text: 'Here is' });
    textChat.emit({ type: 'text-delta', text: ' the current screen summary.' });
    expect(useSessionStore.getState().textSessionLifecycle.status).toBe('receiving');

    textChat.emit({ type: 'completed' });

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

  it('sends the full completed conversation history on each turn', async () => {
    const textChat = createTextChatHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      startTextChatStream: textChat.startTextChatStream,
      requestSessionToken: vi.fn(),
      createTransport: vi.fn(() => createUnusedTransport()),
    });

    await controller.submitTextTurn('First question');
    textChat.emit({ type: 'text-delta', text: 'First answer' });
    textChat.emit({ type: 'completed' });

    await controller.submitTextTurn('Second question');

    expect(textChat.getLastRequest()).toEqual({
      messages: [
        { role: 'user', content: 'First question' },
        { role: 'assistant', content: 'First answer' },
        { role: 'user', content: 'Second question' },
      ],
    });
  });

  it('maps backend stream errors into an inline failed assistant turn', async () => {
    const textChat = createTextChatHarness();
    const logger: RuntimeLogger = {
      onSessionEvent: vi.fn(),
      onTransportEvent: vi.fn(),
    };
    const controller = createDesktopSessionController({
      logger,
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      startTextChatStream: textChat.startTextChatStream,
      requestSessionToken: vi.fn(),
      createTransport: vi.fn(() => createUnusedTransport()),
    });

    await controller.submitTextTurn('Summarize the current screen');
    textChat.emit({ type: 'text-delta', text: 'Partial response' });
    textChat.emit({ type: 'error', detail: 'backend overloaded' });

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        textSessionLifecycle: expect.objectContaining({ status: 'error' }),
        sessionPhase: 'error',
        activeTransport: null,
        lastRuntimeError: 'backend overloaded',
      }),
    );
    expect(useSessionStore.getState().conversationTurns.at(-1)).toEqual(
      expect.objectContaining({
        role: 'assistant',
        content: 'Partial response',
        state: 'error',
        statusLabel: 'Response failed',
      }),
    );
    expect(logger.onTransportEvent).toHaveBeenCalledWith({
      type: 'error',
      detail: 'backend overloaded',
    });
  });

  it('does not append a user turn when text chat cannot start', async () => {
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      startTextChatStream: vi.fn().mockRejectedValue(new Error('stream setup failed')),
      requestSessionToken: vi.fn(),
      createTransport: vi.fn(() => createUnusedTransport()),
    });

    await expect(controller.submitTextTurn('Summarize the current screen')).resolves.toBe(
      false,
    );

    expect(useSessionStore.getState().conversationTurns).toEqual([]);
    expect(useSessionStore.getState().lastRuntimeError).toBe('stream setup failed');
  });

  it('blocks a second submit while the current turn is still in flight', async () => {
    const textChat = createTextChatHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      startTextChatStream: textChat.startTextChatStream,
      requestSessionToken: vi.fn(),
      createTransport: vi.fn(() => createUnusedTransport()),
    });

    await controller.submitTextTurn('First turn');

    await expect(controller.submitTextTurn('Second turn')).resolves.toBe(false);
    expect(textChat.startTextChatStream).toHaveBeenCalledTimes(1);
  });

  it('fails fast when backend health prevents text session start', async () => {
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(false),
      startTextChatStream: createTextChatHarness().startTextChatStream,
      requestSessionToken: vi.fn(),
      createTransport: vi.fn(() => createUnusedTransport()),
    });

    await expect(controller.submitTextTurn('Summarize the current screen')).resolves.toBe(
      false,
    );

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        textSessionLifecycle: expect.objectContaining({ status: 'error' }),
        backendState: 'failed',
        lastRuntimeError: 'Backend health check failed',
        conversationTurns: [],
      }),
    );
  });

  it('calls cancel on the text stream when a turn completes to release IPC listeners', async () => {
    const textChat = createTextChatHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      startTextChatStream: textChat.startTextChatStream,
      requestSessionToken: vi.fn(),
      createTransport: vi.fn(() => createUnusedTransport()),
    });

    await controller.submitTextTurn('Hello');
    textChat.emit({ type: 'text-delta', text: 'Hi' });
    textChat.emit({ type: 'completed' });

    expect(textChat.cancel).toHaveBeenCalledTimes(1);
  });

  it('calls cancel on the text stream when a stream error occurs', async () => {
    const textChat = createTextChatHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      startTextChatStream: textChat.startTextChatStream,
      requestSessionToken: vi.fn(),
      createTransport: vi.fn(() => createUnusedTransport()),
    });

    await controller.submitTextTurn('Hello');
    textChat.emit({ type: 'error', detail: 'server error' });

    expect(textChat.cancel).toHaveBeenCalledTimes(1);
  });

  it('cancels an active text stream when the session ends', async () => {
    const textChat = createTextChatHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      startTextChatStream: textChat.startTextChatStream,
      requestSessionToken: vi.fn(),
      createTransport: vi.fn(() => createUnusedTransport()),
    });

    await controller.submitTextTurn('Summarize the current screen');
    await controller.endSession();

    expect(textChat.cancel).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        textSessionLifecycle: expect.objectContaining({ status: 'disconnected' }),
        sessionPhase: 'idle',
        backendState: 'idle',
        transportState: 'idle',
        activeTransport: null,
        conversationTurns: [],
        lastRuntimeError: null,
      }),
    );
    expect(selectAssistantRuntimeState(useSessionStore.getState())).toBe('disconnected');
    expect(selectIsConversationEmpty(useSessionStore.getState())).toBe(true);
  });

  it('starts local voice capture, publishes chunks, and updates diagnostics without affecting text mode', async () => {
    const voiceCapture = createVoiceCaptureHarness();
    const voiceTransport = createVoiceTransportHarness();
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_DESKTOP_SETTINGS,
        selectedInputDeviceId: 'usb-mic',
      },
      isReady: true,
    });
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      startTextChatStream: createTextChatHarness().startTextChatStream,
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn(() => voiceTransport.transport),
      createVoiceCapture: voiceCapture.createVoiceCapture,
      settingsStore: useSettingsStore,
    });
    const chunkListener = vi.fn();
    const unsubscribe = controller.subscribeToVoiceChunks(chunkListener);

    await controller.startSession({ mode: 'voice' });
    await controller.startVoiceCapture();
    voiceCapture.emitChunk();
    await Promise.resolve();
    await Promise.resolve();
    voiceCapture.emitDiagnostics({
      chunkCount: 1,
      sampleRateHz: 16_000,
      bytesPerChunk: 640,
      chunkDurationMs: 20,
    });

    expect(voiceCapture.start).toHaveBeenCalledWith({
      selectedInputDeviceId: 'usb-mic',
    });
    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        voiceCaptureState: 'capturing',
        voiceSessionStatus: 'streaming',
        textSessionLifecycle: expect.objectContaining({ status: 'idle' }),
      }),
    );
    expect(useSessionStore.getState().voiceCaptureDiagnostics).toEqual(
      expect.objectContaining({
        chunkCount: 1,
        sampleRateHz: 16_000,
        bytesPerChunk: 640,
        chunkDurationMs: 20,
        selectedInputDeviceId: 'usb-mic',
        lastError: null,
      }),
    );
    expect(chunkListener).toHaveBeenCalledWith(
      expect.objectContaining({
        encoding: 'pcm_s16le',
        durationMs: 20,
      }),
    );
    expect(voiceTransport.sendAudioChunk).toHaveBeenCalledWith(
      new Uint8Array(640).fill(1),
    );

    unsubscribe();
  });

  it('stops local voice capture cleanly, flushes audio, and returns the session to ready', async () => {
    const voiceCapture = createVoiceCaptureHarness();
    const voiceTransport = createVoiceTransportHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      startTextChatStream: createTextChatHarness().startTextChatStream,
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn(() => voiceTransport.transport),
      createVoiceCapture: voiceCapture.createVoiceCapture,
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });
    await controller.startVoiceCapture();
    voiceCapture.emitChunk();
    await controller.stopVoiceCapture();

    expect(voiceCapture.stop).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().voiceCaptureState).toBe('stopped');
    expect(useSessionStore.getState().voiceSessionStatus).toBe('ready');
    expect(voiceTransport.sendAudioStreamEnd).toHaveBeenCalledTimes(1);
  });

  it('rejects microphone capture until the voice session is connected', async () => {
    const voiceCapture = createVoiceCaptureHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      startTextChatStream: createTextChatHarness().startTextChatStream,
      requestSessionToken: vi.fn(),
      createTransport: vi.fn(() => createUnusedTransport()),
      createVoiceCapture: voiceCapture.createVoiceCapture,
      settingsStore: useSettingsStore,
    });

    await controller.startVoiceCapture();

    expect(voiceCapture.start).not.toHaveBeenCalled();
    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        voiceSessionStatus: 'disconnected',
        voiceCaptureState: 'error',
        voiceCaptureDiagnostics: expect.objectContaining({
          lastError: 'Voice session is not ready',
        }),
      }),
    );
  });

  it('surfaces voice bootstrap failures clearly', async () => {
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn(),
      startTextChatStream: createTextChatHarness().startTextChatStream,
      requestSessionToken: vi.fn().mockRejectedValue(new Error('token failed')),
      createTransport: vi.fn(() => createUnusedTransport()),
    });

    await controller.startSession({ mode: 'voice' });

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        voiceSessionStatus: 'error',
        tokenRequestState: 'error',
        lastRuntimeError: 'token failed',
      }),
    );
  });

  it('maps voice capture errors into the dedicated voice diagnostics without breaking text state', async () => {
    const voiceCapture = createVoiceCaptureHarness();
    const voiceTransport = createVoiceTransportHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      startTextChatStream: createTextChatHarness().startTextChatStream,
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn(() => voiceTransport.transport),
      createVoiceCapture: voiceCapture.createVoiceCapture,
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });
    await controller.startVoiceCapture();
    voiceCapture.emitError('Microphone permission was denied');

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        voiceCaptureState: 'error',
        voiceSessionStatus: 'error',
        voiceCaptureDiagnostics: expect.objectContaining({
          lastError: 'Microphone permission was denied',
        }),
        textSessionLifecycle: expect.objectContaining({ status: 'idle' }),
      }),
    );
  });
});
