import { useCallback, useEffect } from 'react';
import type { AssistantRuntimeState } from '../../state/assistantUiState';
import { useUiStore, type PanelView } from '../../store/uiStore';
import { type BackendConnectionState, type TokenRequestState } from '../../store/sessionStore';
import { useSessionRuntime } from '../../runtime/useSessionRuntime';
import type { ConversationTurnModel } from '../../runtime/types';

export type AssistantPanelController = {
  assistantState: AssistantRuntimeState;
  isPanelOpen: boolean;
  panelView: PanelView;
  conversationTurns: ConversationTurnModel[];
  isConversationEmpty: boolean;
  setPanelView: (view: PanelView) => void;
  closePanel: () => void;
  setAssistantState: (state: AssistantRuntimeState) => void;
  backendState: BackendConnectionState;
  backendIndicatorState: AssistantRuntimeState;
  backendLabel: string;
  tokenRequestState: TokenRequestState;
  tokenFeedback: string | null;
  lastRuntimeError: string | null;
  handleCheckBackendHealth: () => Promise<void>;
  handleStartTalking: () => Promise<void>;
};

export function useAssistantPanelController(): AssistantPanelController {
  const isPanelOpen = useUiStore((state) => state.isPanelOpen);
  const panelView = useUiStore((state) => state.panelView);
  const closePanel = useUiStore((state) => state.closePanel);
  const setPanelView = useUiStore((state) => state.setPanelView);
  const {
    assistantState,
    backendState,
    backendIndicatorState,
    backendLabel,
    tokenRequestState,
    tokenFeedback,
    conversationTurns,
    lastRuntimeError,
    isConversationEmpty,
    handleCheckBackendHealth,
    handleStartSession,
    setAssistantState,
  } = useSessionRuntime();

  const handleCheckBackendHealthCallback = useCallback(async (): Promise<void> => {
    await handleCheckBackendHealth();
  }, [handleCheckBackendHealth]);

  useEffect(() => {
    if (!isPanelOpen) {
      return;
    }

    void handleCheckBackendHealthCallback();
  }, [handleCheckBackendHealthCallback, isPanelOpen]);

  const handleStartTalking = useCallback(async (): Promise<void> => {
    await handleStartSession();
  }, [handleStartSession]);

  return {
    assistantState,
    isPanelOpen,
    panelView,
    conversationTurns,
    isConversationEmpty,
    setPanelView,
    closePanel,
    setAssistantState,
    backendState,
    backendIndicatorState,
    backendLabel,
    tokenRequestState,
    tokenFeedback,
    lastRuntimeError,
    handleCheckBackendHealth: handleCheckBackendHealthCallback,
    handleStartTalking,
  };
}
