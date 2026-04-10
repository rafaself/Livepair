import { asErrorDetail } from '../core/runtimeUtils';
import { LIVE_ADAPTER_KEY } from '../transport/liveConfig';
import { createSessionCommandDispatcher } from './sessionCommandDispatcher';
import type { SessionCommandSink } from './sessionCommandDispatcher';
import type {
  DesktopSessionController,
  DebugAssistantState,
  SessionStoreApi,
} from '../core/sessionControllerTypes';
import type { SpeechLifecycleStatus } from '../speech/speech.types';
import type { RealtimeOutboundGateway } from '../outbound/outbound.types';

type SessionControllerPublicApiSupervisor = {
  checkBackendHealth: () => Promise<void>;
  startSession: (options: { mode: 'speech' }) => Promise<void>;
  endSession: () => Promise<void>;
  endSpeechMode: () => Promise<void>;
};

type SessionControllerPublicApiArgs = {
  store: SessionStoreApi;
  supervisor: SessionControllerPublicApiSupervisor;
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
    handleSessionCommand: (command: import('../core/session.types').SessionCommand) => {
      accepted: boolean;
      reason?: 'session-already-active' | 'speech-inactive';
    };
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
  onCommand: SessionCommandSink;
};

export function createSessionControllerPublicApi({
  store,
  supervisor,
  voiceChunkCtrl,
  screenCtrl,
  refreshScreenCaptureSourceSnapshot,
  appendTypedUserTurn,
  voiceTranscriptCtrl,
  runtime,
  logRuntimeError,
  onCommand,
}: SessionControllerPublicApiArgs): DesktopSessionController {
  let textSubmitSequence = 0;

  // ── Extracted command handlers ──

  const handleStopVoiceCapture = async (): Promise<void> => {
    const sessionStore = store.getState();

    if (
      sessionStore.voiceCaptureState === 'inactive' ||
      sessionStore.voiceCaptureState === 'muted'
    ) {
      return;
    }

    sessionStore.setVoiceCaptureState('stopping');

    try {
      await voiceChunkCtrl.flush();
      await voiceChunkCtrl.getVoiceCapture().stop();
    } finally {
      store.getState().setVoiceCaptureState(
        runtime.getActiveTransport() ? 'muted' : 'inactive',
      );
    }
  };

  const handleStartScreenCapture = async (): Promise<void> => {
    const didRefresh = await refreshScreenCaptureSourceSnapshot();

    if (!didRefresh) {
      return;
    }

    store.getState().setScreenShareIntended(true);
    await screenCtrl.start();
  };

  const handleStopScreenCapture = async (): Promise<void> => {
    store.getState().setScreenShareIntended(false);
    await screenCtrl.stop();
  };

  const handleSubmitTextTurn = async (text: string): Promise<boolean> => {
    const trimmedText = text.trim();

    if (!trimmedText) {
      return false;
    }

    if (
      runtime.handleSessionCommand({ type: 'textTurn.submit', text: trimmedText }).accepted
    ) {
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
          channelKey: 'text:speech-mode',
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
  };

  // ── Command dispatcher ──

  const dispatcher = createSessionCommandDispatcher({
    onCommand,
    handlers: {
      startSession: (options) => supervisor.startSession(options),
      endSession: () => supervisor.endSession(),
      endSpeechMode: () => supervisor.endSpeechMode(),
      checkBackendHealth: () => supervisor.checkBackendHealth(),
      startVoiceCapture: async () => {
        await voiceChunkCtrl.startCapture();
      },
      stopVoiceCapture: handleStopVoiceCapture,
      startScreenCapture: handleStartScreenCapture,
      stopScreenCapture: handleStopScreenCapture,
      analyzeScreenNow: () => screenCtrl.analyzeScreenNow(),
      submitTextTurn: handleSubmitTextTurn,
    },
  });

  // ── Public controller interface ──
  // All session commands route through the dispatcher.
  // setAssistantState and subscribeToVoiceChunks are not session commands
  // and remain as direct implementations.

  return {
    checkBackendHealth: dispatcher.checkBackendHealth,
    endSpeechMode: dispatcher.endSpeechMode,
    endSession: dispatcher.endSession,
    setAssistantState: (assistantState: DebugAssistantState) => {
      store.getState().setAssistantState(assistantState);
      runtime.recordSessionEvent({
        type: 'session.debug.state.set',
        detail: assistantState,
      });
    },
    startScreenCapture: dispatcher.startScreenCapture,
    analyzeScreenNow: dispatcher.analyzeScreenNow,
    startSession: dispatcher.startSession,
    startVoiceCapture: dispatcher.startVoiceCapture,
    stopScreenCapture: dispatcher.stopScreenCapture,
    stopVoiceCapture: dispatcher.stopVoiceCapture,
    submitTextTurn: dispatcher.submitTextTurn,
    subscribeToVoiceChunks: (listener) => {
      return voiceChunkCtrl.addChunkListener(listener);
    },
  };
}
