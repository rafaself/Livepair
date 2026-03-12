import {
  isSpeechLifecycleActive,
} from './speech/speechSessionLifecycle';
import { asErrorDetail } from './core/runtimeUtils';
import { LIVE_ADAPTER_KEY } from './transport/liveConfig';
import type {
  DesktopSessionController,
  DebugAssistantState,
  SessionStoreApi,
} from './core/sessionControllerTypes';
import type {
  SpeechLifecycleStatus,
} from './speech/speech.types';
import type { SessionMode } from './core/session.types';

type SessionControllerPublicApiArgs = {
  store: SessionStoreApi;
  performBackendHealthCheck: () => Promise<boolean>;
  startSessionInternal: (options: { mode: SessionMode }) => Promise<void>;
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
  textChatCtrl: {
    appendUserTurn: (text: string) => void;
    submitTurn: (text: string) => Promise<boolean>;
  };
  runtime: {
    currentSpeechLifecycleStatus: () => SpeechLifecycleStatus;
    endSessionInternal: (options?: {
      preserveLastRuntimeError?: string | null;
      recordEvents?: boolean;
      preserveVoiceRuntimeDiagnostics?: boolean;
    }) => Promise<void>;
    getActiveTransport: () => import('./transport/transport.types').DesktopSession | null;
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
  textChatCtrl,
  runtime,
  logRuntimeError,
}: SessionControllerPublicApiArgs): DesktopSessionController {
  return {
    checkBackendHealth: async () => {
      await performBackendHealthCheck();
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
          textChatCtrl.appendUserTurn(trimmedText);
          store.getState().setLastRuntimeError(null);
          await activeTransport.sendText(trimmedText);
          runtime.syncSpeechSilenceTimeout(runtime.currentSpeechLifecycleStatus());
          return true;
        } catch (error) {
          const detail = asErrorDetail(error, 'Failed to send speech-mode text turn');
          store.getState().setLastRuntimeError(detail);
          runtime.setVoiceErrorState(detail);
          return false;
        }
      }

      return textChatCtrl.submitTurn(trimmedText);
    },
    subscribeToVoiceChunks: (listener) => {
      return voiceChunkCtrl.addChunkListener(listener);
    },
  };
}
