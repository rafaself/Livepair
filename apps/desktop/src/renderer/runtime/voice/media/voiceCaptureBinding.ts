import type {
  LocalVoiceCapture,
  LocalVoiceCaptureObserver,
} from '../../audio/localVoiceCapture';
import type { AudioInputEvent } from '../../audio/audio.types';
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

    return ops.getActiveTransport() ? 'active' : 'disconnected';
  };

  const handleCaptureEvent = (event: AudioInputEvent): void => {
    switch (event.type) {
      case 'capture.chunk':
        for (const listener of voiceChunkListeners) {
          listener(event.chunk);
        }

        void enqueueChunkSend(event.chunk);
        return;

      case 'capture.diagnostics':
        if (!isRuntimeDebugModeEnabled()) {
          return;
        }

        ops.store.getState().setVoiceCaptureDiagnostics(event.diagnostics);
        return;

      case 'capture.activity':
        ops.store.getState().setLocalUserSpeechActive(event.active);
        return;

      case 'capture.error': {
        const detail = event.detail;
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
        ops.emitDiagnostic?.({
          scope: 'voice-capture',
          name: 'capture-error',
          level: 'error',
          detail,
        });
        return;
      }
    }
  };

  const createCaptureObserver = (): LocalVoiceCaptureObserver => ({
    onEvent: (event) => {
      handleCaptureEvent(event);
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
