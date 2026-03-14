import type { LocalVoiceCapture, LocalVoiceCaptureObserver } from '../../audio/localVoiceCapture';
import type {
  RealtimeOutboundGateway,
} from '../../outbound/outbound.types';
import type { DesktopSession } from '../../transport/transport.types';
import type {
  VoiceSessionStatus,
} from '../voice.types';
import { asErrorDetail } from '../../core/runtimeUtils';
import type { SessionStoreApi, SettingsStoreApi } from '../../core/sessionControllerTypes';
import { createVoiceCaptureBinding } from './voiceCaptureBinding';
import { createVoiceChunkDispatch } from './voiceChunkDispatch';

const VOICE_SESSION_NOT_READY_DETAIL = 'Voice session is not ready';

export type VoiceChunkPipelineOps = {
  store: SessionStoreApi;
  settingsStore: SettingsStoreApi;
  createVoiceCapture: (observer: LocalVoiceCaptureObserver) => LocalVoiceCapture;
  getActiveTransport: () => DesktopSession | null;
  getRealtimeOutboundGateway: () => RealtimeOutboundGateway;
  currentVoiceSessionStatus: () => VoiceSessionStatus;
  setVoiceSessionStatus: (s: VoiceSessionStatus) => void;
  setVoiceErrorState: (detail: string) => void;
  endSessionInternal: (opts: {
    preserveLastRuntimeError: string;
    preserveVoiceRuntimeDiagnostics: boolean;
  }) => void;
  logRuntimeError: (scope: string, message: string, context: Record<string, unknown>) => void;
};

export function createVoiceChunkPipeline(ops: VoiceChunkPipelineOps) {
  const dispatch = createVoiceChunkDispatch(ops);
  const captureBinding = createVoiceCaptureBinding(ops, dispatch.enqueueChunkSend);

  const startCapture = async (
    options: { shutdownOnFailure?: boolean } = {},
  ): Promise<boolean> => {
    const { shutdownOnFailure = false } = options;
    const store = ops.store.getState();

    if (
      store.voiceCaptureState === 'requestingPermission' ||
      store.voiceCaptureState === 'capturing'
    ) {
      return true;
    }

    if (
      store.voiceSessionStatus !== 'ready' &&
      store.voiceSessionStatus !== 'interrupted' &&
      store.voiceSessionStatus !== 'recovering'
    ) {
      store.setVoiceCaptureState('error');
      store.setVoiceCaptureDiagnostics({
        lastError: VOICE_SESSION_NOT_READY_DETAIL,
      });

      if (shutdownOnFailure) {
        store.setVoiceSessionStatus('error');
        store.setLastRuntimeError(VOICE_SESSION_NOT_READY_DETAIL);
        void ops.endSessionInternal({
          preserveLastRuntimeError: VOICE_SESSION_NOT_READY_DETAIL,
          preserveVoiceRuntimeDiagnostics: true,
        });
      }

      return false;
    }

    const selectedInputDeviceId =
      ops.settingsStore.getState().settings.selectedInputDeviceId;
    const {
      voiceEchoCancellationEnabled,
      voiceNoiseSuppressionEnabled,
      voiceAutoGainControlEnabled,
    } = ops.settingsStore.getState().settings;
    store.setVoiceCaptureState('requestingPermission');
    store.setVoiceCaptureDiagnostics({
      chunkCount: 0,
      sampleRateHz: 16_000,
      bytesPerChunk: 640,
      chunkDurationMs: 20,
      selectedInputDeviceId,
      lastError: null,
    });

    try {
      await captureBinding.getVoiceCapture().start({
        selectedInputDeviceId,
        echoCancellationEnabled: voiceEchoCancellationEnabled,
        noiseSuppressionEnabled: voiceNoiseSuppressionEnabled,
        autoGainControlEnabled: voiceAutoGainControlEnabled,
      });
      dispatch.advanceAudioLane();
      ops.store.getState().setVoiceCaptureState('capturing');
      ops.store.getState().setVoiceSessionStatus('ready');
      return true;
    } catch (error) {
      const detail = asErrorDetail(error, 'Failed to start microphone capture');
      ops.store.getState().setVoiceCaptureState('error');
      ops.store.getState().setVoiceSessionStatus('error');
      ops.store.getState().setVoiceCaptureDiagnostics({
        lastError: detail,
        selectedInputDeviceId,
      });
      ops.store.getState().setLastRuntimeError(detail);

      if (shutdownOnFailure) {
        void ops.endSessionInternal({
          preserveLastRuntimeError: detail,
          preserveVoiceRuntimeDiagnostics: true,
        });
      }

      return false;
    }
  };

  return {
    addChunkListener: captureBinding.addChunkListener,
    flush: dispatch.flush,
    getVoiceCapture: captureBinding.getVoiceCapture,
    hasCapture: captureBinding.hasCapture,
    resetSendChain: dispatch.resetSendChain,
    startCapture,
  };
}
