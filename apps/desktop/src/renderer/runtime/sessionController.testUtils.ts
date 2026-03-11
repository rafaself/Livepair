import { vi } from 'vitest';
import type { TextChatRequest, TextChatStreamEvent } from '@livepair/shared-types';
import type { AssistantAudioPlaybackObserver } from './audio/assistantAudioPlayback';
import type { DesktopSession } from './transport/transport.types';
import type {
  LocalVoiceChunk,
  VoiceCaptureDiagnostics,
  VoicePlaybackState,
  VoiceSessionResumptionState,
} from './voice/voice.types';

export function createUnusedTransport(): DesktopSession {
  return {
    kind: 'gemini-live',
    connect: vi.fn(async () => undefined),
    sendText: vi.fn(async () => undefined),
    sendAudioChunk: vi.fn(async () => undefined),
    sendAudioStreamEnd: vi.fn(async () => undefined),
    sendToolResponses: vi.fn(async () => undefined),
    sendVideoFrame: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    subscribe: vi.fn(() => vi.fn()),
  };
}

export function createVoiceTransportHarness(): {
  transport: DesktopSession;
  connect: ReturnType<typeof vi.fn>;
  sendText: ReturnType<typeof vi.fn>;
  sendAudioChunk: ReturnType<typeof vi.fn>;
  sendAudioStreamEnd: ReturnType<typeof vi.fn>;
  sendToolResponses: ReturnType<typeof vi.fn>;
  sendVideoFrame: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  setConnectError: (error: Error | null) => void;
  emit: (event: Parameters<Parameters<DesktopSession['subscribe']>[0]>[0]) => void;
} {
  let listener: ((event: Parameters<Parameters<DesktopSession['subscribe']>[0]>[0]) => void)
    | null = null;
  const sendText = vi.fn(async () => undefined);
  const sendAudioChunk = vi.fn(async () => undefined);
  const sendAudioStreamEnd = vi.fn(async () => undefined);
  const sendToolResponses = vi.fn(async () => undefined);
  const sendVideoFrame = vi.fn(async () => undefined);
  let connectError: Error | null = null;
  const disconnect = vi.fn(async () => {
    listener?.({ type: 'connection-state-changed', state: 'disconnected' });
  });
  const connect = vi.fn(async () => {
    if (connectError) {
      throw connectError;
    }

    listener?.({ type: 'connection-state-changed', state: 'connecting' });
    listener?.({ type: 'connection-state-changed', state: 'connected' });
  });

  return {
    transport: {
      kind: 'gemini-live',
      connect,
      sendText,
      sendAudioChunk,
      sendAudioStreamEnd,
      sendToolResponses,
      sendVideoFrame,
      disconnect,
      subscribe: vi.fn((nextListener) => {
        listener = nextListener;

        return () => {
          listener = null;
        };
      }),
    },
    connect,
    sendText,
    sendAudioChunk,
    sendAudioStreamEnd,
    sendToolResponses,
    sendVideoFrame,
    disconnect,
    setConnectError: (error) => {
      connectError = error;
    },
    emit: (event) => {
      listener?.(event);
    },
  };
}

export function expectDefaultResumptionState(): VoiceSessionResumptionState {
  return {
    status: 'idle',
    latestHandle: null,
    resumable: false,
    lastDetail: null,
  };
}

export function createTextChatHarness(): {
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

export function createVoiceCaptureHarness(): {
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

export function createScreenCaptureHarness(): {
  createScreenCapture: ReturnType<typeof vi.fn>;
  emitFrame: (frame?: Partial<{ data: Uint8Array; mimeType: 'image/jpeg'; sequence: number; widthPx: number; heightPx: number }>) => void;
  emitDiagnostics: (patch: Record<string, unknown>) => void;
  emitError: (detail: string) => void;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
} {
  let observer: {
    onFrame: (frame: { data: Uint8Array; mimeType: 'image/jpeg'; sequence: number; widthPx: number; heightPx: number }) => void;
    onDiagnostics: (patch: Record<string, unknown>) => void;
    onError: (detail: string) => void;
  } | null = null;
  const start = vi.fn(async () => undefined);
  const stop = vi.fn(async () => undefined);

  return {
    createScreenCapture: vi.fn((nextObserver) => {
      observer = nextObserver;
      return { start, stop };
    }),
    emitFrame: (frame = {}) => {
      observer?.onFrame({
        data: new Uint8Array([1, 2, 3]),
        mimeType: 'image/jpeg',
        sequence: 1,
        widthPx: 640,
        heightPx: 360,
        ...frame,
      });
    },
    emitDiagnostics: (patch) => {
      observer?.onDiagnostics(patch);
    },
    emitError: (detail) => {
      observer?.onError(detail);
    },
    start,
    stop,
  };
}

export function createVoicePlaybackHarness(): {
  createVoicePlayback: ReturnType<typeof vi.fn>;
  enqueue: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  emitState: (state: VoicePlaybackState) => void;
  emitDiagnostics: (diagnostics: Record<string, unknown>) => void;
  emitError: (detail: string) => void;
  resolveStop: () => void;
  enableDeferredStop: () => void;
} {
  let observer: AssistantAudioPlaybackObserver | null = null;
  const enqueue = vi.fn(async () => undefined);
  let resolveStopPromise: (() => void) | null = null;
  let useDeferredStop = false;
  const stop = vi.fn(async () => {
    if (!useDeferredStop) {
      return;
    }

    await new Promise<void>((resolve) => {
      resolveStopPromise = resolve;
    });
  });

  return {
    createVoicePlayback: vi.fn((nextObserver) => {
      observer = nextObserver;

      return {
        enqueue,
        stop,
      };
    }),
    enqueue,
    stop,
    emitState: (state) => {
      observer?.onStateChange(state);
    },
    emitDiagnostics: (diagnostics) => {
      observer?.onDiagnostics(diagnostics);
    },
    emitError: (detail) => {
      observer?.onError(detail);
    },
    resolveStop: () => {
      resolveStopPromise?.();
      resolveStopPromise = null;
    },
    enableDeferredStop: () => {
      useDeferredStop = true;
    },
  };
}
