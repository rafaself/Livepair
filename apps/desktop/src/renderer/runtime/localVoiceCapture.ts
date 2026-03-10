import {
  PCM16_CHUNK_BYTE_SIZE,
  PCM16_CHUNK_DURATION_MS,
  Pcm16Chunker,
  StreamingFloat32Resampler,
  TARGET_VOICE_SAMPLE_RATE,
  encodePcm16Le,
  mixToMono,
} from './audioProcessing';
import type { LocalVoiceChunk, VoiceCaptureDiagnostics } from './types';

const CAPTURE_WORKLET_PROCESSOR_NAME = 'livepair-local-voice-capture';
const CAPTURE_WORKLET_MODULE_URL = new URL(
  './localVoiceCaptureProcessor.worklet.js',
  import.meta.url,
).toString();

type CaptureFramePayload = {
  channels?: Float32Array[] | undefined;
};

type TrackLike = {
  stop: () => void;
  addEventListener: (type: 'ended', listener: () => void) => void;
  removeEventListener: (type: 'ended', listener: () => void) => void;
};

type MediaStreamLike = {
  getTracks: () => TrackLike[];
};

export type MediaStreamAudioSourceNodeLike = {
  connect: (...args: unknown[]) => unknown;
  disconnect: () => void;
};

export type AudioWorkletNodeLike = {
  port: {
    onmessage: ((event: MessageEvent) => void) | null;
    onmessageerror: ((event: MessageEvent) => void) | null;
  };
  connect: (...args: unknown[]) => unknown;
  disconnect: () => void;
};

type AudioContextLike = {
  audioWorklet: {
    addModule: (url: string) => Promise<void>;
  };
  sampleRate: number;
  createMediaStreamSource: (stream: MediaStream) => MediaStreamAudioSourceNodeLike;
  resume: () => Promise<void>;
  close: () => Promise<void>;
};

export type LocalVoiceCaptureObserver = {
  onChunk: (chunk: LocalVoiceChunk) => void;
  onDiagnostics: (diagnostics: Partial<VoiceCaptureDiagnostics>) => void;
  onError: (detail: string) => void;
};

export type LocalVoiceCapture = {
  start: (options: { selectedInputDeviceId: string }) => Promise<void>;
  stop: () => Promise<void>;
};

export type CreateLocalVoiceCaptureDependencies = {
  mediaDevices?: Pick<MediaDevices, 'getUserMedia'>;
  createAudioContext?: () => AudioContextLike;
  createAudioWorkletNode?: (
    context: AudioContextLike,
    name: string,
  ) => AudioWorkletNodeLike;
  loadCaptureWorklet?: (context: AudioContextLike) => Promise<void>;
};

function buildAudioConstraints(selectedInputDeviceId: string): MediaTrackConstraints {
  return {
    channelCount: { ideal: 1 },
    // Prefer browser-level cleanup as a lightweight mitigation for false
    // server-side barge-in from ambient noise until local VAD lands.
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    ...(selectedInputDeviceId === 'default'
      ? {}
      : { deviceId: { exact: selectedInputDeviceId } }),
  };
}

async function loadCaptureWorklet(context: AudioContextLike): Promise<void> {
  await context.audioWorklet.addModule(CAPTURE_WORKLET_MODULE_URL);
}

function createAudioContext(): AudioContextLike {
  const ctor = window.AudioContext ?? (window as typeof window & {
    webkitAudioContext?: typeof AudioContext;
  }).webkitAudioContext;

  if (!ctor) {
    throw new Error('AudioContext is not available in this environment');
  }

  return new ctor() as unknown as AudioContextLike;
}

function createAudioWorkletNode(
  context: AudioContextLike,
  name: string,
): AudioWorkletNodeLike {
  return new AudioWorkletNode(context as AudioContext, name, {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    channelCount: 1,
    channelCountMode: 'explicit',
  }) as unknown as AudioWorkletNodeLike;
}

function getCaptureErrorDetail(error: unknown): string {
  const name = typeof error === 'object' && error !== null && 'name' in error
    ? String((error as { name?: unknown }).name)
    : '';

  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone permission was denied';
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No microphone device is available';
  }

  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return 'Failed to start microphone capture';
}

export function createLocalVoiceCapture(
  observer: LocalVoiceCaptureObserver,
  {
    mediaDevices = navigator.mediaDevices,
    createAudioContext: createAudioContextImpl = createAudioContext,
    createAudioWorkletNode: createAudioWorkletNodeImpl = createAudioWorkletNode,
    loadCaptureWorklet: loadCaptureWorkletImpl = loadCaptureWorklet,
  }: CreateLocalVoiceCaptureDependencies = {},
): LocalVoiceCapture {
  let activeStream: MediaStreamLike | null = null;
  let activeTracks: TrackLike[] = [];
  let activeAudioContext: AudioContextLike | null = null;
  let activeSourceNode: MediaStreamAudioSourceNodeLike | null = null;
  let activeWorkletNode: AudioWorkletNodeLike | null = null;
  let endedTrackListener: (() => void) | null = null;
  let nextChunkSequence = 0;
  let emittedChunkCount = 0;
  let resampler: StreamingFloat32Resampler | null = null;
  let chunker = new Pcm16Chunker();
  let currentInputDeviceId: string | null = null;

  const emitDiagnostics = (
    diagnostics: Partial<VoiceCaptureDiagnostics>,
  ): void => {
    observer.onDiagnostics({
      bytesPerChunk: PCM16_CHUNK_BYTE_SIZE,
      chunkDurationMs: PCM16_CHUNK_DURATION_MS,
      sampleRateHz: TARGET_VOICE_SAMPLE_RATE,
      ...diagnostics,
    });
  };

  const cleanupResources = async (): Promise<void> => {
    endedTrackListener?.();
    endedTrackListener = null;
    activeSourceNode?.disconnect();
    activeSourceNode = null;
    activeWorkletNode?.disconnect();

    if (activeWorkletNode) {
      activeWorkletNode.port.onmessage = null;
      activeWorkletNode.port.onmessageerror = null;
    }

    activeWorkletNode = null;

    for (const track of activeTracks) {
      track.stop();
    }

    activeTracks = [];
    activeStream = null;

    if (activeAudioContext) {
      await activeAudioContext.close();
      activeAudioContext = null;
    }

    resampler = null;
    chunker.reset();
    nextChunkSequence = 0;
    emittedChunkCount = 0;
  };

  const handleAudioFrame = (payload: CaptureFramePayload): void => {
    if (!resampler || !payload.channels || payload.channels.length === 0) {
      return;
    }

    const mono = mixToMono(payload.channels);
    const normalized = resampler.push(mono);
    const encoded = encodePcm16Le(normalized);
    const chunks = chunker.push(encoded);

    for (const data of chunks) {
      emittedChunkCount += 1;
      const chunk: LocalVoiceChunk = {
        data,
        sampleRateHz: TARGET_VOICE_SAMPLE_RATE,
        channels: 1,
        encoding: 'pcm_s16le',
        durationMs: PCM16_CHUNK_DURATION_MS,
        sequence: ++nextChunkSequence,
      };

      observer.onChunk(chunk);
      emitDiagnostics({
        chunkCount: emittedChunkCount,
        selectedInputDeviceId: currentInputDeviceId,
        lastError: null,
      });
    }
  };

  return {
    start: async ({ selectedInputDeviceId }) => {
      if (!mediaDevices?.getUserMedia) {
        const detail = 'Microphone capture is not available in this environment';
        emitDiagnostics({ lastError: detail, selectedInputDeviceId });
        observer.onError(detail);
        throw new Error(detail);
      }

      if (activeStream) {
        return;
      }

      currentInputDeviceId = selectedInputDeviceId;
      emitDiagnostics({
        chunkCount: 0,
        selectedInputDeviceId,
        lastError: null,
      });

      try {
        const stream = await mediaDevices.getUserMedia({
          audio: buildAudioConstraints(selectedInputDeviceId),
        });
        const audioContext = createAudioContextImpl();
        await loadCaptureWorkletImpl(audioContext);
        const workletNode = createAudioWorkletNodeImpl(
          audioContext,
          CAPTURE_WORKLET_PROCESSOR_NAME,
        );
        const sourceNode = audioContext.createMediaStreamSource(stream as MediaStream);
        resampler = new StreamingFloat32Resampler(
          audioContext.sampleRate,
          TARGET_VOICE_SAMPLE_RATE,
        );
        chunker = new Pcm16Chunker();
        nextChunkSequence = 0;
        emittedChunkCount = 0;
        activeStream = stream;
        activeAudioContext = audioContext;
        activeSourceNode = sourceNode;
        activeWorkletNode = workletNode;
        activeTracks = stream.getTracks();

        sourceNode.connect(workletNode);
        workletNode.port.onmessage = (event) => {
          handleAudioFrame(event.data as CaptureFramePayload);
        };
        workletNode.port.onmessageerror = () => {
          const detail = 'Microphone capture failed while receiving audio frames';
          emitDiagnostics({ lastError: detail, selectedInputDeviceId: currentInputDeviceId });
          observer.onError(detail);
        };

        const handleTrackEnded = (): void => {
          const detail = 'Microphone capture stopped unexpectedly';
          emitDiagnostics({ lastError: detail, selectedInputDeviceId: currentInputDeviceId });
          observer.onError(detail);
          void cleanupResources();
        };

        for (const track of activeTracks) {
          track.addEventListener('ended', handleTrackEnded);
        }

        endedTrackListener = () => {
          for (const track of activeTracks) {
            track.removeEventListener('ended', handleTrackEnded);
          }
        };

        await audioContext.resume();
      } catch (error) {
        const detail = getCaptureErrorDetail(error);
        await cleanupResources();
        emitDiagnostics({ lastError: detail, selectedInputDeviceId });
        observer.onError(detail);
        throw new Error(detail);
      }
    },
    stop: async () => {
      if (!activeStream && !activeAudioContext) {
        return;
      }

      await cleanupResources();
    },
  };
}
