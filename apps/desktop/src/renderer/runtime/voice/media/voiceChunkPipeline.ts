import type { LocalVoiceCapture, LocalVoiceCaptureObserver } from '../../audio/localVoiceCapture';
import type {
  RealtimeOutboundAudioChunkEvent,
  RealtimeOutboundGateway,
} from '../../outbound/outbound.types';
import type { DesktopSession } from '../../transport/transport.types';
import type {
  LocalVoiceChunk,
  VoiceSessionStatus,
} from '../voice.types';
import { asErrorDetail } from '../../core/runtimeUtils';
import type { SessionStoreApi, SettingsStoreApi } from '../../core/sessionControllerTypes';

const VOICE_SESSION_NOT_READY_DETAIL = 'Voice session is not ready';
const AUDIO_MICROPHONE_CHANNEL_KEY = 'audio:microphone';

type PendingAudioChunk = {
  chunk: LocalVoiceChunk;
  transport: DesktopSession;
  outboundEvent: RealtimeOutboundAudioChunkEvent;
};

type VoiceChunkPipelineOps = {
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
  let voiceCapture: LocalVoiceCapture | null = null;
  let voiceSendChain = Promise.resolve();
  let voiceDispatchGeneration = 0;
  let audioLaneGeneration = 0;
  let audioDispatchInFlight = false;
  let pendingChunk: PendingAudioChunk | null = null;
  const voiceChunkListeners = new Set<(chunk: LocalVoiceChunk) => void>();

  const currentAudioChannelKey = (): string =>
    `${AUDIO_MICROPHONE_CHANNEL_KEY}:${audioLaneGeneration}`;

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
        onSpeechActivity: (active) => {
          ops.store.getState().setLocalUserSpeechActive(active);
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

    const outboundEvent: RealtimeOutboundAudioChunkEvent = {
      kind: 'audio_chunk',
      channelKey: currentAudioChannelKey(),
      sequence: chunk.sequence,
      createdAtMs: Date.now(),
      estimatedBytes: chunk.data.byteLength,
    };
    const decision = ops.getRealtimeOutboundGateway().submit(outboundEvent);

    if (decision.outcome === 'drop' || decision.outcome === 'block') {
      return Promise.resolve();
    }

    const acceptedChunk: PendingAudioChunk = {
      chunk,
      transport,
      outboundEvent,
    };

    if (pendingChunk) {
      ops.getRealtimeOutboundGateway().settle(outboundEvent);
      return voiceSendChain;
    }

    pendingChunk = acceptedChunk;

    const dispatchGeneration = voiceDispatchGeneration;
    const drainPendingChunks = (): Promise<void> => {
      if (audioDispatchInFlight) {
        return voiceSendChain;
      }

      audioDispatchInFlight = true;
      const drainPromise = (async () => {
        while (pendingChunk) {
          const nextChunk = pendingChunk;
          pendingChunk = null;

          try {
            if (ops.getActiveTransport() !== nextChunk.transport) {
              continue;
            }

            await nextChunk.transport.sendAudioChunk(nextChunk.chunk.data);

            if (ops.getActiveTransport() !== nextChunk.transport) {
              continue;
            }

            ops.getRealtimeOutboundGateway().recordSuccess();
            if (
              ops.currentVoiceSessionStatus() === 'capturing' ||
              ops.currentVoiceSessionStatus() === 'ready' ||
              ops.currentVoiceSessionStatus() === 'interrupted' ||
              ops.currentVoiceSessionStatus() === 'recovering'
            ) {
              ops.setVoiceSessionStatus('streaming');
            }
          } catch (error) {
            const detail = asErrorDetail(error, 'Failed to stream microphone audio');
            store.setVoiceCaptureDiagnostics({
              lastError: detail,
            });
            ops.getRealtimeOutboundGateway().recordFailure(detail);
            ops.setVoiceErrorState(detail);
          } finally {
            ops.getRealtimeOutboundGateway().settle(nextChunk.outboundEvent);
          }
        }
      })().finally(() => {
        if (dispatchGeneration !== voiceDispatchGeneration) {
          return;
        }

        audioDispatchInFlight = false;
        if (pendingChunk) {
          void drainPendingChunks();
        }
      });

      voiceSendChain = drainPromise;
      return drainPromise;
    };

    voiceSendChain = drainPendingChunks();

    return voiceSendChain;
  };

  const flush = async (): Promise<void> => {
    while (audioDispatchInFlight || pendingChunk) {
      await voiceSendChain;
    }

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
      audioLaneGeneration += 1;
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
    resetSendChain: () => {
      voiceDispatchGeneration += 1;
      if (pendingChunk) {
        ops.getRealtimeOutboundGateway().settle(pendingChunk.outboundEvent);
      }
      pendingChunk = null;
      audioDispatchInFlight = false;
      voiceSendChain = Promise.resolve();
    },
    addChunkListener: (listener: (chunk: LocalVoiceChunk) => void) => {
      voiceChunkListeners.add(listener);
      return () => { voiceChunkListeners.delete(listener); };
    },
    hasCapture: () => voiceCapture !== null,
  };
}
