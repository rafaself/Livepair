import type {
  LocalVoiceCapture,
  LocalVoiceCaptureObserver,
} from '../../audio/localVoiceCapture';
import { isRuntimeDebugModeEnabled } from '../../core/debugMode';
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

  const getVoiceSessionStatusAfterCaptureError = (): ReturnType<
    VoiceChunkPipelineOps['currentVoiceSessionStatus']
  > => {
    const currentStatus = ops.currentVoiceSessionStatus();

    if (currentStatus === 'interrupted' || currentStatus === 'recovering') {
      return currentStatus;
    }

    return ops.getActiveTransport() ? 'ready' : 'disconnected';
  };

  const createCaptureObserver = (): LocalVoiceCaptureObserver => ({
    onChunk: (chunk) => {
      for (const listener of voiceChunkListeners) {
        listener(chunk);
      }

      void enqueueChunkSend(chunk);
    },
    onDiagnostics: (diagnostics) => {
      if (!isRuntimeDebugModeEnabled()) {
        return;
      }

      ops.store.getState().setVoiceCaptureDiagnostics(diagnostics);
    },
    onError: (detail) => {
      const store = ops.store.getState();
      const currentStatus = ops.currentVoiceSessionStatus();

      store.setVoiceCaptureState('error');
      store.setLocalUserSpeechActive(false);
      if (
        currentStatus !== 'connecting'
        && currentStatus !== 'stopping'
        && currentStatus !== 'disconnected'
        && currentStatus !== 'error'
      ) {
        store.setVoiceSessionStatus(getVoiceSessionStatusAfterCaptureError());
      }
      store.setLastRuntimeError(detail);
      store.setVoiceCaptureDiagnostics({
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
