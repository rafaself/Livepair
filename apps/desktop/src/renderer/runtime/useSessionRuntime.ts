import { useCallback } from 'react';
import {
  selectAssistantRuntimeState,
  selectBackendIndicatorState,
  selectBackendLabel,
  selectCanSubmitText,
  selectIsConversationEmpty,
  selectIsSessionActive,
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
  const textSessionStatus = useSessionStore((state) => state.textSessionStatus);
  const textSessionStatusLabel = useSessionStore(selectTextSessionStatusLabel);
  const canSubmitText = useSessionStore(selectCanSubmitText);
  const conversationTurns = useSessionStore((state) => state.conversationTurns);
  const lastRuntimeError = useSessionStore((state) => state.lastRuntimeError);
  const isConversationEmpty = useSessionStore(selectIsConversationEmpty);
  const isSessionActive = useSessionStore(selectIsSessionActive);
  const controller = getDesktopSessionController();

  const handleCheckBackendHealth = useCallback(async (): Promise<void> => {
    await controller.checkBackendHealth();
  }, [controller]);

  const handleStartSession = useCallback(async (): Promise<void> => {
    await controller.startSession({ mode: 'text' });
  }, [controller]);

  const handleSubmitTextTurn = useCallback(async (text: string): Promise<boolean> => {
    return controller.submitTextTurn(text);
  }, [controller]);

  const handleEndSession = useCallback(async (): Promise<void> => {
    await controller.endSession();
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
    handleCheckBackendHealth,
    handleStartSession,
    handleSubmitTextTurn,
    handleEndSession,
    setAssistantState,
  };
}
