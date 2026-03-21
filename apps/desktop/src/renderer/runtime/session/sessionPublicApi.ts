import {
  isSpeechLifecycleActive,
} from '../speech/speechSessionLifecycle';
import { asErrorDetail } from '../core/runtimeUtils';
import { LIVE_ADAPTER_KEY } from '../transport/liveConfig';
import type {
  DesktopSessionController,
  DebugAssistantState,
  SessionStoreApi,
} from '../core/sessionControllerTypes';
import type {
  SpeechLifecycleStatus,
} from '../speech/speech.types';
import type { RealtimeOutboundGateway } from '../outbound/outbound.types';

const TEXT_SPEECH_MODE_CHANNEL_KEY = 'text:speech-mode';

type SessionControllerPublicApiArgs = {
  store: SessionStoreApi;
  performBackendHealthCheck: () => Promise<boolean>;
  startSessionInternal: (options: { mode: 'speech' }) => Promise<void>;
  voiceChunkCtrl: {
    addChunkListener: (
      listener: Parameters<DesktopSessionController['subscribeToVoiceChunks']>[0],
    ) => () => void;
    flush: () => Promise<void>;
    getVoiceCapture: () => {
      stop: () => Promise<void>;
    };
    startCapture: () => Promise<boolean>;
  };
  screenCtrl: {
    start: () => Promise<void>;
    stop: () => Promise<void>;
    analyzeScreenNow: () => void;
    isActive: () => boolean;
  };
  refreshScreenCaptureSourceSnapshot: () => Promise<boolean>;
  appendTypedUserTurn: (text: string) => string;
  voiceTranscriptCtrl: {
    clearQueuedMixedModeAssistantReply: () => void;
    queueMixedModeAssistantReply: () => void;
  };
  runtime: {
    currentSpeechLifecycleStatus: () => SpeechLifecycleStatus;
    endSessionInternal: (options?: {
      preserveLastRuntimeError?: string | null;
      recordEvents?: boolean;
      preserveVoiceRuntimeDiagnostics?: boolean;
      liveSessionEnd?: {
        status: 'ended' | 'failed';
        endedReason?: string | null;
      };
    }) => Promise<void>;
    endSpeechModeInternal: (options?: { recordEvents?: boolean }) => Promise<void>;
    getActiveTransport: () => import('../transport/transport.types').DesktopSession | null;
    getRealtimeOutboundGateway: () => RealtimeOutboundGateway;
    recordSessionEvent: (event: {
      type: 'session.debug.state.set';
      detail: DebugAssistantState;
    }) => void;
    setVoiceErrorState: (detail: string) => void;
    syncSpeechSilenceTimeout: (status: SpeechLifecycleStatus) => void;
  };
  logRuntimeError: (
    scope: 'voice-session',
    message: string,
    detail: Record<string, unknown>,
  ) => void;
};

export function createSessionControllerPublicApi({
  store,
  performBackendHealthCheck,
  startSessionInternal,
  voiceChunkCtrl,
  screenCtrl,
  refreshScreenCaptureSourceSnapshot,
  appendTypedUserTurn,
  voiceTranscriptCtrl,
  runtime,
  logRuntimeError,
}: SessionControllerPublicApiArgs): DesktopSessionController {
  let textSubmitSequence = 0;

  return {
    checkBackendHealth: async () => {
      await performBackendHealthCheck();
    },
    endSpeechMode: async () => {
      await runtime.endSpeechModeInternal({ recordEvents: true });
    },
    endSession: async () => {
      await runtime.endSessionInternal({ recordEvents: true });
    },
    setAssistantState: (assistantState: DebugAssistantState) => {
      store.getState().setAssistantState(assistantState);
      runtime.recordSessionEvent({
        type: 'session.debug.state.set',
        detail: assistantState,
      });
    },
    startScreenCapture: async () => {
      const didRefresh = await refreshScreenCaptureSourceSnapshot();

      if (!didRefresh) {
        return;
      }

      store.getState().setScreenShareIntended(true);
      await screenCtrl.start();
    },
    analyzeScreenNow: () => {
      screenCtrl.analyzeScreenNow();
    },
    startSession: async ({ mode }) => {
      // Speech-mode start owns the default connect + mic-on contract.
      await startSessionInternal({ mode });
    },
    startVoiceCapture: async () => {
      // Explicit capture start is reserved for in-session unmute/resume behavior.
      await voiceChunkCtrl.startCapture();
    },
    stopScreenCapture: () => {
      store.getState().setScreenShareIntended(false);
      return screenCtrl.stop();
    },
    stopVoiceCapture: async () => {
      const sessionStore = store.getState();

      if (
        sessionStore.voiceCaptureState === 'idle' ||
        sessionStore.voiceCaptureState === 'stopped'
      ) {
        return;
      }

      sessionStore.setVoiceCaptureState('stopping');
      sessionStore.setVoiceSessionStatus('stopping');

      try {
        await voiceChunkCtrl.flush();
        await voiceChunkCtrl.getVoiceCapture().stop();
      } finally {
        store.getState().setVoiceCaptureState('stopped');
        store
          .getState()
          .setVoiceSessionStatus(runtime.getActiveTransport() ? 'ready' : 'disconnected');
      }
    },
    submitTextTurn: async (text: string) => {
      const trimmedText = text.trim();

      if (!trimmedText) {
        return false;
      }

      if (isSpeechLifecycleActive(runtime.currentSpeechLifecycleStatus())) {
        const activeTransport = runtime.getActiveTransport();

        if (!activeTransport || activeTransport.kind !== LIVE_ADAPTER_KEY) {
          logRuntimeError('voice-session', 'submit aborted because voice transport is unavailable', {
            textLength: trimmedText.length,
          });
          return false;
        }

        try {
          const outboundGateway = runtime.getRealtimeOutboundGateway();
          textSubmitSequence += 1;
          const decision = outboundGateway.submit({
            kind: 'text',
            channelKey: TEXT_SPEECH_MODE_CHANNEL_KEY,
            sequence: textSubmitSequence,
            createdAtMs: Date.now(),
            estimatedBytes: trimmedText.length,
          });

          if (decision.outcome !== 'send') {
            logRuntimeError('voice-session', 'submit blocked by outbound guardrails', {
              textLength: trimmedText.length,
              outcome: decision.outcome,
              reason: decision.reason,
            });
            return false;
          }

          appendTypedUserTurn(trimmedText);
          voiceTranscriptCtrl.queueMixedModeAssistantReply();
          store.getState().setLastRuntimeError(null);
          await activeTransport.sendText(trimmedText);
          outboundGateway.recordSuccess();
          runtime.syncSpeechSilenceTimeout(runtime.currentSpeechLifecycleStatus());
          return true;
        } catch (error) {
          voiceTranscriptCtrl.clearQueuedMixedModeAssistantReply();
          const detail = asErrorDetail(error, 'Failed to send speech-mode text turn');
          store.getState().setLastRuntimeError(detail);
          runtime.getRealtimeOutboundGateway().recordFailure(detail);
          runtime.setVoiceErrorState(detail);
          return false;
        }
      }

      return false;
    },
    subscribeToVoiceChunks: (listener) => {
      return voiceChunkCtrl.addChunkListener(listener);
    },
  };
}
