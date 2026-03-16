import type { LocalVoiceCaptureObserver } from './localVoiceCapture';
import {
  PCM16_CHUNK_BYTE_SIZE,
  PCM16_CHUNK_DURATION_MS,
  TARGET_VOICE_SAMPLE_RATE,
} from './audioProcessing';
import type { LocalVoiceChunk, VoiceCaptureDiagnostics } from '../voice/voice.types';

type AudioChunkMessage = {
  type: 'audio-chunk';
  chunk?: Uint8Array | undefined;
};

type SpeechActivityMessage = {
  type: 'speech-activity';
  active: boolean;
};

type WorkletMessage = AudioChunkMessage | SpeechActivityMessage;

type TrackLike = {
  stop: () => void;
  addEventListener: (type: 'ended', listener: () => void) => void;
  removeEventListener: (type: 'ended', listener: () => void) => void;
};

type MediaStreamLike = {
  getTracks: () => TrackLike[];
};

type MediaStreamAudioSourceNodeLike = {
  connect: (...args: unknown[]) => unknown;
  disconnect: () => void;
};

type AudioWorkletNodeLike = {
  port: {
    onmessage: ((event: MessageEvent) => void) | null;
    onmessageerror: ((event: MessageEvent) => void) | null;
  };
  connect: (...args: unknown[]) => unknown;
  disconnect: () => void;
};

type AudioContextLike = {
  sampleRate: number;
  close: () => Promise<void>;
};

type ActivateCaptureOptions = {
  selectedInputDeviceId: string;
  stream: MediaStreamLike;
  audioContext: AudioContextLike;
  sourceNode: MediaStreamAudioSourceNodeLike;
  workletNode: AudioWorkletNodeLike;
};

export function createLocalVoiceCaptureRuntime(
  observer: LocalVoiceCaptureObserver,
) {
  let activeStream: MediaStreamLike | null = null;
  let activeTracks: TrackLike[] = [];
  let activeAudioContext: AudioContextLike | null = null;
  let activeSourceNode: MediaStreamAudioSourceNodeLike | null = null;
  let activeWorkletNode: AudioWorkletNodeLike | null = null;
  let endedTrackListener: (() => void) | null = null;
  let nextChunkSequence = 0;
  let emittedChunkCount = 0;
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
    observer.onSpeechActivity?.(false);

    for (const track of activeTracks) {
      track.stop();
    }

    activeTracks = [];
    activeStream = null;

    if (activeAudioContext) {
      const context = activeAudioContext;
      activeAudioContext = null;
      await context.close();
    }

    nextChunkSequence = 0;
    emittedChunkCount = 0;
  };

  const handleAudioChunk = (payload: AudioChunkMessage): void => {
    if (!(payload.chunk instanceof Uint8Array)) {
      return;
    }

    emittedChunkCount += 1;
    const chunk: LocalVoiceChunk = {
      data: payload.chunk,
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
  };

  const activate = ({
    selectedInputDeviceId,
    stream,
    audioContext,
    sourceNode,
    workletNode,
  }: ActivateCaptureOptions): void => {
    currentInputDeviceId = selectedInputDeviceId;
    nextChunkSequence = 0;
    emittedChunkCount = 0;
    activeStream = stream;
    activeAudioContext = audioContext;
    activeSourceNode = sourceNode;
    activeWorkletNode = workletNode;
    activeTracks = stream.getTracks();

    sourceNode.connect(workletNode);
    workletNode.port.onmessage = (event) => {
      const message = event.data as WorkletMessage;
      if ('type' in message && message.type === 'speech-activity') {
        observer.onSpeechActivity?.(message.active);
        return;
      }

      if ('type' in message && message.type === 'audio-chunk') {
        handleAudioChunk(message);
      }
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
  };

  return {
    activate,
    cleanupResources,
    emitDiagnostics,
    hasActiveCapture: (): boolean => activeStream !== null || activeAudioContext !== null,
  };
}
