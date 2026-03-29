import { useCallback } from 'react';
import {
  selectLiveRuntimeConversationSnapshot,
  selectLiveRuntimeDiagnosticsSnapshot,
  selectLiveRuntimeSessionSnapshot,
  type LiveRuntimeConversationSnapshot,
  type LiveRuntimeDiagnosticsSnapshot,
  type LiveRuntimeSessionSnapshot,
} from './selectors';
import { getDesktopSessionController } from './sessionController';
import { useSessionStore } from '../store/sessionStore';

export function useLiveRuntimeSessionSnapshot(): LiveRuntimeSessionSnapshot {
  const activeTransport = useSessionStore((state) => state.activeTransport);
  const assistantActivity = useSessionStore((state) => state.assistantActivity);
  const backendState = useSessionStore((state) => state.backendState);
  const currentMode = useSessionStore((state) => state.currentMode);
  const lastRuntimeError = useSessionStore((state) => state.lastRuntimeError);
  const localUserSpeechActive = useSessionStore((state) => state.localUserSpeechActive);
  const screenCaptureState = useSessionStore((state) => state.screenCaptureState);
  const speechLifecycle = useSessionStore((state) => state.speechLifecycle);
  const textSessionLifecycle = useSessionStore((state) => state.textSessionLifecycle);
  const tokenRequestState = useSessionStore((state) => state.tokenRequestState);
  const voiceCaptureState = useSessionStore((state) => state.voiceCaptureState);
  const voiceSessionResumption = useSessionStore((state) => state.voiceSessionResumption);
  const voiceSessionStatus = useSessionStore((state) => state.voiceSessionStatus);

  return selectLiveRuntimeSessionSnapshot({
    activeTransport,
    assistantActivity,
    backendState,
    currentMode,
    lastRuntimeError,
    localUserSpeechActive,
    screenCaptureState,
    speechLifecycle,
    textSessionLifecycle,
    tokenRequestState,
    voiceCaptureState,
    voiceSessionResumption,
    voiceSessionStatus,
  });
}

export function useLiveRuntimeConversationSnapshot(): LiveRuntimeConversationSnapshot {
  const conversationTurns = useSessionStore((state) => state.conversationTurns);
  const transcriptArtifacts = useSessionStore((state) => state.transcriptArtifacts);

  return selectLiveRuntimeConversationSnapshot({
    conversationTurns,
    transcriptArtifacts,
  });
}

export function useLiveRuntimeDiagnosticsSnapshot(): LiveRuntimeDiagnosticsSnapshot {
  const activeVoiceSessionGroundingEnabled = useSessionStore(
    (state) => state.activeVoiceSessionGroundingEnabled,
  );
  const backendState = useSessionStore((state) => state.backendState);
  const effectiveVoiceSessionCapabilities = useSessionStore(
    (state) => state.effectiveVoiceSessionCapabilities,
  );
  const ignoredAssistantOutputDiagnostics = useSessionStore(
    (state) => state.ignoredAssistantOutputDiagnostics,
  );
  const realtimeOutboundDiagnostics = useSessionStore(
    (state) => state.realtimeOutboundDiagnostics,
  );
  const screenCaptureDiagnostics = useSessionStore((state) => state.screenCaptureDiagnostics);
  const screenCaptureState = useSessionStore((state) => state.screenCaptureState);
  const tokenRequestState = useSessionStore((state) => state.tokenRequestState);
  const visualSendDiagnostics = useSessionStore((state) => state.visualSendDiagnostics);
  const voiceCaptureDiagnostics = useSessionStore((state) => state.voiceCaptureDiagnostics);
  const voiceCaptureState = useSessionStore((state) => state.voiceCaptureState);
  const voiceLiveSignalDiagnostics = useSessionStore((state) => state.voiceLiveSignalDiagnostics);
  const voicePlaybackDiagnostics = useSessionStore((state) => state.voicePlaybackDiagnostics);
  const voicePlaybackState = useSessionStore((state) => state.voicePlaybackState);
  const voiceSessionDurability = useSessionStore((state) => state.voiceSessionDurability);
  const voiceSessionLatency = useSessionStore((state) => state.voiceSessionLatency);
  const voiceSessionRecoveryDiagnostics = useSessionStore(
    (state) => state.voiceSessionRecoveryDiagnostics,
  );
  const voiceSessionResumption = useSessionStore((state) => state.voiceSessionResumption);
  const voiceSessionStatus = useSessionStore((state) => state.voiceSessionStatus);
  const voiceToolState = useSessionStore((state) => state.voiceToolState);
  const voiceTranscriptDiagnostics = useSessionStore((state) => state.voiceTranscriptDiagnostics);

  return selectLiveRuntimeDiagnosticsSnapshot({
    activeVoiceSessionGroundingEnabled,
    backendState,
    effectiveVoiceSessionCapabilities,
    ignoredAssistantOutputDiagnostics,
    realtimeOutboundDiagnostics,
    screenCaptureDiagnostics,
    screenCaptureState,
    tokenRequestState,
    visualSendDiagnostics,
    voiceCaptureDiagnostics,
    voiceCaptureState,
    voiceLiveSignalDiagnostics,
    voicePlaybackDiagnostics,
    voicePlaybackState,
    voiceSessionDurability,
    voiceSessionLatency,
    voiceSessionRecoveryDiagnostics,
    voiceSessionResumption,
    voiceSessionStatus,
    voiceToolState,
    voiceTranscriptDiagnostics,
  });
}

export function useSessionRuntime() {
  const snapshot = useLiveRuntimeSessionSnapshot();
  const controller = getDesktopSessionController();

  const handleCheckBackendHealth = useCallback(async (): Promise<void> => {
    await controller.checkBackendHealth();
  }, [controller]);

  const handleStartVoiceSession = useCallback(async (): Promise<void> => {
    await controller.startSession({ mode: 'speech' });
  }, [controller]);

  const handleSubmitTextTurn = useCallback(async (text: string): Promise<boolean> => {
    return controller.submitTextTurn(text);
  }, [controller]);

  const handleEndSpeechMode = useCallback(async (): Promise<void> => {
    await controller.endSpeechMode();
  }, [controller]);

  const handleEndSession = useCallback(async (): Promise<void> => {
    await controller.endSession();
  }, [controller]);

  const handleStartVoiceCapture = useCallback(async (): Promise<void> => {
    await controller.startVoiceCapture();
  }, [controller]);

  const handleStopVoiceCapture = useCallback(async (): Promise<void> => {
    await controller.stopVoiceCapture();
  }, [controller]);

  const handleStartScreenCapture = useCallback(async (): Promise<void> => {
    await controller.startScreenCapture();
  }, [controller]);

  const handleStopScreenCapture = useCallback(async (): Promise<void> => {
    await controller.stopScreenCapture();
  }, [controller]);

  const handleSendScreenNow = useCallback((): void => {
    controller.analyzeScreenNow();
  }, [controller]);

  const setAssistantState = useCallback(
    (assistantState: Parameters<typeof controller.setAssistantState>[0]): void => {
      controller.setAssistantState(assistantState);
    },
    [controller],
  );

  return {
    snapshot,
    ...snapshot,
    handleCheckBackendHealth,
    handleStartVoiceSession,
    handleStartVoiceCapture,
    handleStopVoiceCapture,
    handleStartScreenCapture,
    handleStopScreenCapture,
    handleSendScreenNow,
    handleSubmitTextTurn,
    handleEndSpeechMode,
    handleEndSession,
    setAssistantState,
  };
}
