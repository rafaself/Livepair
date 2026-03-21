import { asErrorDetail } from '../../core/runtimeUtils';
import type {
  RealtimeOutboundAudioChunkEvent,
} from '../../outbound/outbound.types';
import type { DesktopSession } from '../../transport/transport.types';
import type {
  LocalVoiceChunk,
} from '../voice.types';
import type { VoiceChunkPipelineOps } from './voiceChunkPipeline';

const AUDIO_MICROPHONE_CHANNEL_KEY = 'audio:microphone';

type PendingAudioChunk = {
  chunk: LocalVoiceChunk;
  transport: DesktopSession;
  outboundEvent: RealtimeOutboundAudioChunkEvent;
};

export function createVoiceChunkDispatch(ops: VoiceChunkPipelineOps) {
  let voiceSendChain = Promise.resolve();
  let voiceDispatchGeneration = 0;
  let audioLaneGeneration = 0;
  let audioDispatchInFlight = false;
  let pendingChunk: PendingAudioChunk | null = null;

  const currentAudioChannelKey = (): string =>
    `${AUDIO_MICROPHONE_CHANNEL_KEY}:${audioLaneGeneration}`;

  const enqueueChunkSend = (chunk: LocalVoiceChunk): Promise<void> => {
    const store = ops.store.getState();
    const transport = ops.getActiveTransport();

    // Resume swaps transports without buffering microphone audio across sessions.
    // Chunks that arrive while no active transport is attached are dropped on purpose.
    if (!transport || ops.currentVoiceSessionStatus() === 'disconnected') {
      return Promise.resolve();
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

  return {
    advanceAudioLane: (): void => {
      audioLaneGeneration += 1;
    },
    enqueueChunkSend,
    flush,
    resetSendChain: (): void => {
      voiceDispatchGeneration += 1;
      if (pendingChunk) {
        ops.getRealtimeOutboundGateway().settle(pendingChunk.outboundEvent);
      }
      pendingChunk = null;
      audioDispatchInFlight = false;
      voiceSendChain = Promise.resolve();
    },
  };
}
