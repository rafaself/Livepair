import { useCallback } from 'react';
import {
  selectAssistantRuntimeState,
  selectBackendIndicatorState,
  selectBackendLabel,
  selectIsConversationEmpty,
  selectIsSessionActive,
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
  const conversationTurns = useSessionStore((state) => state.conversationTurns);
  const isConversationEmpty = useSessionStore(selectIsConversationEmpty);
  const isSessionActive = useSessionStore(selectIsSessionActive);
  const controller = getDesktopSessionController();

  const handleCheckBackendHealth = useCallback(async (): Promise<void> => {
    await controller.checkBackendHealth();
  }, [controller]);

  const handleStartSession = useCallback(async (): Promise<void> => {
    await controller.startSession();
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
    conversationTurns,
    isConversationEmpty,
    isSessionActive,
    handleCheckBackendHealth,
    handleStartSession,
    handleEndSession,
    setAssistantState,
  };
}
