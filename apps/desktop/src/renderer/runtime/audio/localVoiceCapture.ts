import type { LocalVoiceChunk, VoiceCaptureDiagnostics } from '../voice/voice.types';
import { createLocalVoiceCaptureRuntime } from './localVoiceCaptureRuntime';

const CAPTURE_WORKLET_PROCESSOR_NAME = 'livepair-local-voice-capture';
const CAPTURE_WORKLET_MODULE_URL = new URL(
  './localVoiceCaptureProcessor.worklet.js',
  import.meta.url,
).toString();

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
  onSpeechActivity?: (active: boolean) => void;
};

export type LocalVoiceCapture = {
  start: (options: {
    selectedInputDeviceId: string;
    echoCancellationEnabled: boolean;
    noiseSuppressionEnabled: boolean;
    autoGainControlEnabled: boolean;
  }) => Promise<void>;
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

function buildAudioConstraints({
  selectedInputDeviceId,
  echoCancellationEnabled,
  noiseSuppressionEnabled,
  autoGainControlEnabled,
}: {
  selectedInputDeviceId: string;
  echoCancellationEnabled: boolean;
  noiseSuppressionEnabled: boolean;
  autoGainControlEnabled: boolean;
}): MediaTrackConstraints {
  return {
    channelCount: { ideal: 1 },
    echoCancellation: echoCancellationEnabled,
    noiseSuppression: noiseSuppressionEnabled,
    autoGainControl: autoGainControlEnabled,
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
  const runtime = createLocalVoiceCaptureRuntime(observer);

  return {
    start: async ({
      selectedInputDeviceId,
      echoCancellationEnabled,
      noiseSuppressionEnabled,
      autoGainControlEnabled,
    }) => {
      if (!mediaDevices?.getUserMedia) {
        const detail = 'Microphone capture is not available in this environment';
        runtime.emitDiagnostics({ lastError: detail, selectedInputDeviceId });
        observer.onError(detail);
        throw new Error(detail);
      }

      if (runtime.hasActiveCapture()) {
        return;
      }

      runtime.emitDiagnostics({
        chunkCount: 0,
        selectedInputDeviceId,
        lastError: null,
      });

      try {
        const stream = await mediaDevices.getUserMedia({
          audio: buildAudioConstraints({
            selectedInputDeviceId,
            echoCancellationEnabled,
            noiseSuppressionEnabled,
            autoGainControlEnabled,
          }),
        });
        const audioContext = createAudioContextImpl();
        await loadCaptureWorkletImpl(audioContext);
        const workletNode = createAudioWorkletNodeImpl(
          audioContext,
          CAPTURE_WORKLET_PROCESSOR_NAME,
        );
        const sourceNode = audioContext.createMediaStreamSource(stream as MediaStream);
        runtime.activate({
          selectedInputDeviceId,
          stream: stream as MediaStreamLike,
          audioContext,
          sourceNode,
          workletNode,
        });
        await audioContext.resume();
      } catch (error) {
        const detail = getCaptureErrorDetail(error);
        await runtime.cleanupResources();
        runtime.emitDiagnostics({ lastError: detail, selectedInputDeviceId });
        observer.onError(detail);
        throw new Error(detail);
      }
    },
    stop: async () => {
      if (!runtime.hasActiveCapture()) {
        return;
      }

      await runtime.cleanupResources();
    },
  };
}
