import type {
  AssistantAudioPlayback as AssistantAudioPlaybackContract,
  AudioOutputObserver,
} from './audio.types';
import type {
  VoicePlaybackDiagnostics,
  VoicePlaybackState,
} from '../voice/voice.types';
import { decodePcm16Le } from './assistantAudioPlaybackPcm';
import { createAssistantAudioPlaybackOutputRoute } from './assistantAudioPlaybackOutput';

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

type AudioContextLike = {
  currentTime: number;
  destination: unknown;
  createBuffer: (
    numberOfChannels: number,
    length: number,
    sampleRate: number,
  ) => AudioBufferLike;
  createBufferSource: () => AudioBufferSourceNodeLike;
  createMediaStreamDestination?: () => { stream: MediaStream };
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

export type AssistantAudioPlaybackObserver = AudioOutputObserver;

export type AssistantAudioPlayback = AssistantAudioPlaybackContract;

type CreateAssistantAudioPlaybackDependencies = {
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

export function createAssistantAudioPlayback(
  observer: AssistantAudioPlaybackObserver,
  {
    selectedOutputDeviceId = DEFAULT_OUTPUT_DEVICE_ID,
    createAudioContext: createAudioContextImpl = createAudioContext,
    createAudioElement: createAudioElementImpl = createAudioElement,
  }: CreateAssistantAudioPlaybackDependencies = {},
): AssistantAudioPlayback {
  let state: VoicePlaybackState = 'idle';
  let scheduledUntilTime = 0;
  let chunkCount = 0;
  const activeSources = new Set<AudioBufferSourceNodeLike>();

  const emitState = (nextState: VoicePlaybackState): void => {
    if (state === nextState) {
      return;
    }

    state = nextState;
    observer.onEvent({ type: 'playback.state', state: nextState });
  };

  const emitDiagnostics = (
    patch: Partial<VoicePlaybackDiagnostics>,
  ): void => {
    observer.onEvent({
      type: 'playback.diagnostics',
      diagnostics: {
        sampleRateHz: ASSISTANT_PLAYBACK_SAMPLE_RATE_HZ,
        chunkCount,
        queueDepth: activeSources.size,
        selectedOutputDeviceId: outputRoute.getEffectiveOutputDeviceId(),
        ...patch,
      },
    });
  };

  const outputRoute = createAssistantAudioPlaybackOutputRoute({
    selectedOutputDeviceId,
    createAudioContext: createAudioContextImpl,
    createAudioElement: createAudioElementImpl,
    emitDiagnostics,
  });

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

    await outputRoute.cleanup();
  };

  const handleSourceEnded = (source: AudioBufferSourceNodeLike): void => {
    activeSources.delete(source);
    source.disconnect();
    emitDiagnostics({
      queueDepth: activeSources.size,
    });

    if (activeSources.size === 0 && state !== 'stopping' && state !== 'error') {
      scheduledUntilTime = outputRoute.getAudioContext()?.currentTime ?? 0;
      emitState('stopped');
    }
  };

  const failPlayback = async (detail: string): Promise<never> => {
    observer.onEvent({ type: 'playback.error', detail });
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
        await outputRoute.ensureOutputRoute();
        const context = outputRoute.getAudioContext();
        const destination = outputRoute.getPlaybackDestination();

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
      if (state === 'idle' && !outputRoute.getAudioContext()) {
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
