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

type SessionControllerPublicApiArgs = {
  store: SessionStoreApi;
  performBackendHealthCheck: () => Promise<boolean>;
  startSessionInternal: (options: { mode: 'voice' }) => Promise<void>;
  voiceChunkCtrl: {
    addChunkListener: (
      listener: Parameters<DesktopSessionController['subscribeToVoiceChunks']>[0],
    ) => () => void;
    flush: () => Promise<void>;
    getVoiceCapture: () => {
      stop: () => Promise<void>;
    };
    startCapture: (options?: { shutdownOnFailure?: boolean }) => Promise<boolean>;
  };
  screenCtrl: {
    start: () => Promise<void>;
    stop: () => Promise<void>;
  };
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
  appendTypedUserTurn,
  voiceTranscriptCtrl,
  runtime,
  logRuntimeError,
}: SessionControllerPublicApiArgs): DesktopSessionController {
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
    startScreenCapture: () => {
      return screenCtrl.start();
    },
    startSession: async ({ mode }) => {
      await startSessionInternal({ mode });
    },
    startVoiceCapture: async () => {
      await voiceChunkCtrl.startCapture();
    },
    stopScreenCapture: () => {
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
          appendTypedUserTurn(trimmedText);
          voiceTranscriptCtrl.queueMixedModeAssistantReply();
          store.getState().setLastRuntimeError(null);
          await activeTransport.sendText(trimmedText);
          runtime.syncSpeechSilenceTimeout(runtime.currentSpeechLifecycleStatus());
          return true;
        } catch (error) {
          voiceTranscriptCtrl.clearQueuedMixedModeAssistantReply();
          const detail = asErrorDetail(error, 'Failed to send speech-mode text turn');
          store.getState().setLastRuntimeError(detail);
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
