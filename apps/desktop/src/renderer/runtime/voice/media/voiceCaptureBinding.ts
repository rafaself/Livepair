import type {
  LocalVoiceCapture,
  LocalVoiceCaptureObserver,
} from '../../audio/localVoiceCapture';
import type { LocalVoiceChunk } from '../voice.types';
import type { VoiceChunkPipelineOps } from './voiceChunkPipeline';

type VoiceCaptureBinding = {
  addChunkListener: (listener: (chunk: LocalVoiceChunk) => void) => () => void;
  getVoiceCapture: () => LocalVoiceCapture;
  hasCapture: () => boolean;
};

export function createVoiceCaptureBinding(
  ops: VoiceChunkPipelineOps,
  enqueueChunkSend: (chunk: LocalVoiceChunk) => Promise<void>,
): VoiceCaptureBinding {
  let voiceCapture: LocalVoiceCapture | null = null;
  const voiceChunkListeners = new Set<(chunk: LocalVoiceChunk) => void>();

  const createCaptureObserver = (): LocalVoiceCaptureObserver => ({
    onChunk: (chunk) => {
      for (const listener of voiceChunkListeners) {
        listener(chunk);
      }

      ops.store.getState().setVoiceCaptureDiagnostics({
        chunkCount: chunk.sequence,
        sampleRateHz: chunk.sampleRateHz,
        bytesPerChunk: chunk.data.byteLength,
        chunkDurationMs: chunk.durationMs,
        lastError: null,
      });
      void enqueueChunkSend(chunk);
    },
    onDiagnostics: (diagnostics) => {
      ops.store.getState().setVoiceCaptureDiagnostics(diagnostics);
    },
    onError: (detail) => {
      ops.store.getState().setVoiceCaptureState('error');
      ops.store.getState().setVoiceSessionStatus('error');
      ops.store.getState().setLastRuntimeError(detail);
      ops.store.getState().setVoiceCaptureDiagnostics({
        lastError: detail,
      });
      ops.logRuntimeError('voice-capture', 'local capture failed', { detail });
    },
    onSpeechActivity: (active) => {
      ops.store.getState().setLocalUserSpeechActive(active);
    },
  });

  const getVoiceCapture = (): LocalVoiceCapture => {
    if (!voiceCapture) {
      voiceCapture = ops.createVoiceCapture(createCaptureObserver());
    }

    return voiceCapture;
  };

  return {
    addChunkListener: (listener: (chunk: LocalVoiceChunk) => void) => {
      voiceChunkListeners.add(listener);
      return () => {
        voiceChunkListeners.delete(listener);
      };
    },
    getVoiceCapture,
    hasCapture: () => voiceCapture !== null,
  };
}
