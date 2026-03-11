import type {
  AssistantAudioPlayback as AssistantAudioPlaybackContract,
  VoicePlaybackDiagnostics,
  VoicePlaybackState,
} from './types';

const ASSISTANT_PLAYBACK_SAMPLE_RATE_HZ = 24_000;
const DEFAULT_OUTPUT_DEVICE_ID = 'default';

type AudioBufferLike = {
  duration: number;
  getChannelData: (channel: number) => Float32Array;
};

type AudioBufferSourceNodeLike = {
  buffer: AudioBufferLike | null;
  connect: (destination: unknown) => unknown;
  disconnect: () => void;
  start: (when?: number) => void;
  stop: (when?: number) => void;
  onended: (() => void) | null;
};

type MediaStreamDestinationLike = {
  stream: MediaStream;
};

type AudioContextLike = {
  currentTime: number;
  destination: unknown;
  createBuffer: (
    numberOfChannels: number,
    length: number,
    sampleRate: number,
  ) => AudioBufferLike;
  createBufferSource: () => AudioBufferSourceNodeLike;
  createMediaStreamDestination?: () => MediaStreamDestinationLike;
  close: () => Promise<void>;
};

type AudioElementLike = {
  autoplay: boolean;
  muted: boolean;
  srcObject: MediaStream | null;
  play: () => Promise<void>;
  pause: () => void;
  removeAttribute: (qualifiedName: string) => void;
  setSinkId?: (sinkId: string) => Promise<void>;
};

export type AssistantAudioPlaybackObserver = {
  onStateChange: (state: VoicePlaybackState) => void;
  onDiagnostics: (diagnostics: Partial<VoicePlaybackDiagnostics>) => void;
  onError: (detail: string) => void;
};

export type AssistantAudioPlayback = AssistantAudioPlaybackContract;

export type CreateAssistantAudioPlaybackDependencies = {
  selectedOutputDeviceId?: string;
  createAudioContext?: () => AudioContextLike;
  createAudioElement?: () => AudioElementLike;
};

function createAudioContext(): AudioContextLike {
  const ctor = window.AudioContext ?? (window as typeof window & {
    webkitAudioContext?: typeof AudioContext;
  }).webkitAudioContext;

  if (!ctor) {
    throw new Error('AudioContext is not available in this environment');
  }

  return new ctor({
    latencyHint: 'interactive',
  }) as unknown as AudioContextLike;
}

function createAudioElement(): AudioElementLike {
  return document.createElement('audio') as unknown as AudioElementLike;
}

function decodePcm16Le(chunk: Uint8Array): Float32Array {
  if (chunk.byteLength === 0 || chunk.byteLength % 2 !== 0) {
    throw new Error('Assistant audio chunk was malformed');
  }

  const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  const sampleCount = chunk.byteLength / 2;
  const decoded = new Float32Array(sampleCount);

  for (let index = 0; index < sampleCount; index += 1) {
    const sample = view.getInt16(index * 2, true);
    decoded[index] = sample < 0 ? sample / 32768 : sample / 32767;
  }

  return decoded;
}

export function createAssistantAudioPlayback(
  observer: AssistantAudioPlaybackObserver,
  {
    selectedOutputDeviceId = DEFAULT_OUTPUT_DEVICE_ID,
    createAudioContext: createAudioContextImpl = createAudioContext,
    createAudioElement: createAudioElementImpl = createAudioElement,
  }: CreateAssistantAudioPlaybackDependencies = {},
): AssistantAudioPlayback {
  let state: VoicePlaybackState = 'idle';
  let audioContext: AudioContextLike | null = null;
  let playbackDestination: unknown = null;
  let audioElement: AudioElementLike | null = null;
  let effectiveOutputDeviceId = DEFAULT_OUTPUT_DEVICE_ID;
  let scheduledUntilTime = 0;
  let chunkCount = 0;
  const activeSources = new Set<AudioBufferSourceNodeLike>();

  const emitState = (nextState: VoicePlaybackState): void => {
    if (state === nextState) {
      return;
    }

    state = nextState;
    observer.onStateChange(nextState);
  };

  const emitDiagnostics = (
    patch: Partial<VoicePlaybackDiagnostics>,
  ): void => {
    observer.onDiagnostics({
      sampleRateHz: ASSISTANT_PLAYBACK_SAMPLE_RATE_HZ,
      chunkCount,
      queueDepth: activeSources.size,
      selectedOutputDeviceId: effectiveOutputDeviceId,
      ...patch,
    });
  };

  const resetQueue = (): void => {
    scheduledUntilTime = 0;
    activeSources.clear();
  };

  const cleanup = async (): Promise<void> => {
    const sources = Array.from(activeSources);
    resetQueue();

    for (const source of sources) {
      source.onended = null;

      try {
        source.stop(0);
      } catch {
        // Ignore stop errors while tearing down playback.
      }

      source.disconnect();
    }

    if (audioElement) {
      audioElement.pause();
      audioElement.srcObject = null;
      audioElement.removeAttribute('src');
      audioElement = null;
    }

    if (audioContext) {
      const context = audioContext;
      audioContext = null;
      playbackDestination = null;
      await context.close();
    }
  };

  const ensureOutputRoute = async (): Promise<void> => {
    if (audioContext && playbackDestination) {
      return;
    }

    const context = createAudioContextImpl();
    audioContext = context;
    playbackDestination = context.destination;
    effectiveOutputDeviceId = DEFAULT_OUTPUT_DEVICE_ID;

    if (
      selectedOutputDeviceId === DEFAULT_OUTPUT_DEVICE_ID ||
      typeof context.createMediaStreamDestination !== 'function'
    ) {
      emitDiagnostics({});
      return;
    }

    const element = createAudioElementImpl();

    if (typeof element.setSinkId !== 'function') {
      emitDiagnostics({});
      return;
    }

    try {
      const mediaDestination = context.createMediaStreamDestination();
      element.autoplay = true;
      element.muted = false;
      element.srcObject = mediaDestination.stream;
      await element.setSinkId(selectedOutputDeviceId);
      await element.play();
      audioElement = element;
      playbackDestination = mediaDestination;
      effectiveOutputDeviceId = selectedOutputDeviceId;
    } catch {
      element.pause();
      element.srcObject = null;
      element.removeAttribute('src');
      playbackDestination = context.destination;
      effectiveOutputDeviceId = DEFAULT_OUTPUT_DEVICE_ID;
    }

    emitDiagnostics({});
  };

  const handleSourceEnded = (source: AudioBufferSourceNodeLike): void => {
    activeSources.delete(source);
    source.disconnect();
    emitDiagnostics({
      queueDepth: activeSources.size,
    });

    if (activeSources.size === 0 && state !== 'stopping' && state !== 'error') {
      scheduledUntilTime = audioContext?.currentTime ?? 0;
      emitState('stopped');
    }
  };

  const failPlayback = async (detail: string): Promise<never> => {
    observer.onError(detail);
    emitDiagnostics({
      queueDepth: 0,
      lastError: detail,
    });
    emitState('error');
    await cleanup();
    throw new Error(detail);
  };

  return {
    enqueue: async (chunk) => {
      try {
        await ensureOutputRoute();
        const context = audioContext;
        const destination = playbackDestination;

        if (!context || !destination) {
          throw new Error('Assistant audio playback is unavailable');
        }

        const decoded = decodePcm16Le(chunk);
        const buffer = context.createBuffer(
          1,
          decoded.length,
          ASSISTANT_PLAYBACK_SAMPLE_RATE_HZ,
        );
        buffer.getChannelData(0).set(decoded);

        emitState('buffering');
        chunkCount += 1;

        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(destination);
        source.onended = () => {
          handleSourceEnded(source);
        };

        const startTime = Math.max(context.currentTime, scheduledUntilTime);
        scheduledUntilTime = startTime + buffer.duration;
        activeSources.add(source);
        source.start(startTime);
        emitDiagnostics({
          queueDepth: activeSources.size,
          lastError: null,
        });
        emitState('playing');
      } catch (error) {
        const detail = error instanceof Error && error.message.length > 0
          ? error.message
          : 'Assistant audio playback failed';
        await failPlayback(detail);
      }
    },
    stop: async () => {
      if (state === 'idle' && !audioContext) {
        emitState('stopped');
        emitDiagnostics({
          queueDepth: 0,
        });
        return;
      }

      emitState('stopping');
      await cleanup();
      emitDiagnostics({
        queueDepth: 0,
        lastError: null,
      });
      emitState('stopped');
    },
  };
}
