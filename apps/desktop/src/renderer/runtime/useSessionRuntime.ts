import { useCallback } from 'react';
import {
  selectAssistantRuntimeState,
  selectBackendIndicatorState,
  selectBackendLabel,
  selectCanSubmitText,
  selectIsSessionActive,
  selectTextSessionStatus,
  selectTextSessionStatusLabel,
  selectTokenFeedback,
} from './selectors';
import { getDesktopSessionController } from './sessionController';
import { isSpeechLifecycleActive } from './speech/speechSessionLifecycle';
import { useSessionStore } from '../store/sessionStore';

export function useSessionRuntime() {
  const assistantState = useSessionStore(selectAssistantRuntimeState);
  const currentMode = useSessionStore((state) => state.currentMode);
  const activeTransport = useSessionStore((state) => state.activeTransport);
  const backendState = useSessionStore((state) => state.backendState);
  const backendIndicatorState = useSessionStore(selectBackendIndicatorState);
  const backendLabel = useSessionStore(selectBackendLabel);
  const tokenRequestState = useSessionStore((state) => state.tokenRequestState);
  const tokenFeedback = useSessionStore(selectTokenFeedback);
  const textSessionStatus = useSessionStore(selectTextSessionStatus);
  const textSessionStatusLabel = useSessionStore(selectTextSessionStatusLabel);
  const canSubmitText = useSessionStore(selectCanSubmitText);
  const lastRuntimeError = useSessionStore((state) => state.lastRuntimeError);
  const isSessionActive = useSessionStore(selectIsSessionActive);
  const speechLifecycleStatus = useSessionStore((state) => state.speechLifecycle.status);
  const voiceSessionStatus = useSessionStore((state) => state.voiceSessionStatus);
  const voiceCaptureState = useSessionStore((state) => state.voiceCaptureState);
  const screenCaptureState = useSessionStore((state) => state.screenCaptureState);
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

  const handleAnalyzeScreenNow = useCallback((): void => {
    controller.analyzeScreenNow();
  }, [controller]);

  const setAssistantState = useCallback(
    (assistantState: Parameters<typeof controller.setAssistantState>[0]): void => {
      controller.setAssistantState(assistantState);
    },
    [controller],
  );

  return {
    assistantState,
    currentMode,
    activeTransport,
    isSpeechMode: currentMode === 'speech',
    backendState,
    backendIndicatorState,
    backendLabel,
    tokenRequestState,
    tokenFeedback,
    textSessionStatus,
    textSessionStatusLabel,
    canSubmitText,
    lastRuntimeError,
    isSessionActive,
    isVoiceSessionActive: isSpeechLifecycleActive(speechLifecycleStatus),
    speechLifecycleStatus,
    voiceSessionStatus,
    voiceCaptureState,
    screenCaptureState,
    handleCheckBackendHealth,
    handleStartVoiceSession,
    handleStartVoiceCapture,
    handleStopVoiceCapture,
    handleStartScreenCapture,
    handleStopScreenCapture,
    handleAnalyzeScreenNow,
    handleSubmitTextTurn,
    handleEndSpeechMode,
    handleEndSession,
    setAssistantState,
  };
}
