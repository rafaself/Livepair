import type { LocalVoiceCapture, LocalVoiceCaptureObserver } from '../../audio/localVoiceCapture';
import type { DesktopSession } from '../../transport/transport.types';
import type {
  LocalVoiceChunk,
  VoiceSessionStatus,
} from '../voice.types';
import { asErrorDetail } from '../../core/runtimeUtils';
import type { SessionStoreApi, SettingsStoreApi } from '../../core/sessionControllerTypes';

const VOICE_SESSION_NOT_READY_DETAIL = 'Voice session is not ready';

type VoiceChunkPipelineOps = {
  store: SessionStoreApi;
  settingsStore: SettingsStoreApi;
  createVoiceCapture: (observer: LocalVoiceCaptureObserver) => LocalVoiceCapture;
  getActiveTransport: () => DesktopSession | null;
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
  let voiceCapture: LocalVoiceCapture | null = null;
  let voiceSendChain = Promise.resolve();
  const voiceChunkListeners = new Set<(chunk: LocalVoiceChunk) => void>();

  const getVoiceCapture = (): LocalVoiceCapture => {
    if (!voiceCapture) {
      voiceCapture = ops.createVoiceCapture({
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
      });
    }

    return voiceCapture;
  };

  const enqueueChunkSend = (chunk: LocalVoiceChunk): Promise<void> => {
    const store = ops.store.getState();
    const transport = ops.getActiveTransport();

    // Resume swaps transports without buffering microphone audio across sessions.
    // Chunks that arrive while no active transport is attached are dropped on purpose.
    if (!transport || ops.currentVoiceSessionStatus() === 'disconnected') {
      return Promise.resolve();
    }

    if (
      ops.currentVoiceSessionStatus() === 'ready' ||
      ops.currentVoiceSessionStatus() === 'interrupted' ||
      ops.currentVoiceSessionStatus() === 'recovering'
    ) {
      ops.setVoiceSessionStatus('capturing');
    }

    voiceSendChain = voiceSendChain
      .then(async () => {
        if (ops.getActiveTransport() !== transport) {
          return;
        }

        await transport.sendAudioChunk(chunk.data);

        if (ops.getActiveTransport() !== transport) {
          return;
        }

        if (
          ops.currentVoiceSessionStatus() === 'capturing' ||
          ops.currentVoiceSessionStatus() === 'ready' ||
          ops.currentVoiceSessionStatus() === 'interrupted' ||
          ops.currentVoiceSessionStatus() === 'recovering'
        ) {
          ops.setVoiceSessionStatus('streaming');
        }
      })
      .catch((error) => {
        const detail = asErrorDetail(error, 'Failed to stream microphone audio');
        store.setVoiceCaptureDiagnostics({
          lastError: detail,
        });
        ops.setVoiceErrorState(detail);
      });

    return voiceSendChain;
  };

  const flush = async (): Promise<void> => {
    await voiceSendChain;
    await ops.getActiveTransport()?.sendAudioStreamEnd();
  };

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
      await getVoiceCapture().start({
        selectedInputDeviceId,
        echoCancellationEnabled: voiceEchoCancellationEnabled,
        noiseSuppressionEnabled: voiceNoiseSuppressionEnabled,
        autoGainControlEnabled: voiceAutoGainControlEnabled,
      });
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
    getVoiceCapture,
    startCapture,
    flush,
    resetSendChain: () => { voiceSendChain = Promise.resolve(); },
    addChunkListener: (listener: (chunk: LocalVoiceChunk) => void) => {
      voiceChunkListeners.add(listener);
      return () => { voiceChunkListeners.delete(listener); };
    },
    hasCapture: () => voiceCapture !== null,
  };
}
