import { useCallback } from 'react';
import {
  selectAssistantRuntimeState,
  selectBackendIndicatorState,
  selectBackendLabel,
  selectCanSubmitText,
  selectIsConversationEmpty,
  selectIsSessionActive,
  selectTextSessionStatus,
  selectTextSessionStatusLabel,
  selectTokenFeedback,
} from './selectors';
import { getDesktopSessionController } from './sessionController';
import { useSessionStore } from '../store/sessionStore';

export function useSessionRuntime() {
  const assistantState = useSessionStore(selectAssistantRuntimeState);
  const backendState = useSessionStore((state) => state.backendState);
  const backendIndicatorState = useSessionStore(selectBackendIndicatorState);
  const backendLabel = useSessionStore(selectBackendLabel);
  const tokenRequestState = useSessionStore((state) => state.tokenRequestState);
  const tokenFeedback = useSessionStore(selectTokenFeedback);
  const textSessionStatus = useSessionStore(selectTextSessionStatus);
  const textSessionStatusLabel = useSessionStore(selectTextSessionStatusLabel);
  const canSubmitText = useSessionStore(selectCanSubmitText);
  const conversationTurns = useSessionStore((state) => state.conversationTurns);
  const lastRuntimeError = useSessionStore((state) => state.lastRuntimeError);
  const isConversationEmpty = useSessionStore(selectIsConversationEmpty);
  const isSessionActive = useSessionStore(selectIsSessionActive);
  const voiceSessionStatus = useSessionStore((state) => state.voiceSessionStatus);
  const voiceSessionResumption = useSessionStore((state) => state.voiceSessionResumption);
  const voiceCaptureState = useSessionStore((state) => state.voiceCaptureState);
  const voiceCaptureDiagnostics = useSessionStore((state) => state.voiceCaptureDiagnostics);
  const voicePlaybackState = useSessionStore((state) => state.voicePlaybackState);
  const voicePlaybackDiagnostics = useSessionStore((state) => state.voicePlaybackDiagnostics);
  const currentVoiceTranscript = useSessionStore((state) => state.currentVoiceTranscript);
  const screenCaptureState = useSessionStore((state) => state.screenCaptureState);
  const screenCaptureDiagnostics = useSessionStore((state) => state.screenCaptureDiagnostics);
  const controller = getDesktopSessionController();

  const handleCheckBackendHealth = useCallback(async (): Promise<void> => {
    await controller.checkBackendHealth();
  }, [controller]);

  const handleStartSession = useCallback(async (): Promise<void> => {
    await controller.startSession({ mode: 'text' });
  }, [controller]);

  const handleStartVoiceSession = useCallback(async (): Promise<void> => {
    await controller.startSession({ mode: 'voice' });
  }, [controller]);

  const handleSubmitTextTurn = useCallback(async (text: string): Promise<boolean> => {
    return controller.submitTextTurn(text);
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

  const setAssistantState = useCallback(
    (assistantState: Parameters<typeof controller.setAssistantState>[0]): void => {
      controller.setAssistantState(assistantState);
    },
    [controller],
  );

  return {
    assistantState,
    backendState,
    backendIndicatorState,
    backendLabel,
    tokenRequestState,
    tokenFeedback,
    textSessionStatus,
    textSessionStatusLabel,
    canSubmitText,
    conversationTurns,
    lastRuntimeError,
    isConversationEmpty,
    isSessionActive,
    isVoiceSessionActive:
      voiceSessionStatus !== 'disconnected' && voiceSessionStatus !== 'error',
    voiceSessionStatus,
    voiceSessionResumption,
    voiceCaptureState,
    voiceCaptureDiagnostics,
    voicePlaybackState,
    voicePlaybackDiagnostics,
    currentVoiceTranscript,
    screenCaptureState,
    screenCaptureDiagnostics,
    handleCheckBackendHealth,
    handleStartSession,
    handleStartVoiceSession,
    handleStartVoiceCapture,
    handleStopVoiceCapture,
    handleStartScreenCapture,
    handleStopScreenCapture,
    handleSubmitTextTurn,
    handleEndSession,
    setAssistantState,
  };
}
