import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import type { AssistantRuntimeState } from '../../state/assistantUiState';
import { useUiStore, type PanelView } from '../../store/uiStore';
import { type BackendConnectionState, type TokenRequestState } from '../../store/sessionStore';
import { useSessionRuntime } from '../../runtime/useSessionRuntime';
import type { ConversationTurnModel, TextSessionStatus } from '../../runtime/types';

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
  textSessionStatus: TextSessionStatus;
  textSessionStatusLabel: string;
  canSubmitText: boolean;
  lastRuntimeError: string | null;
  draftText: string;
  isSubmittingTextTurn: boolean;
  handleDraftTextChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handleSubmitTextTurn: (event: FormEvent<HTMLFormElement>) => Promise<void>;
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
    textSessionStatus,
    textSessionStatusLabel,
    canSubmitText,
    conversationTurns,
    lastRuntimeError,
    isConversationEmpty,
    handleCheckBackendHealth,
    handleStartSession,
    handleSubmitTextTurn,
    setAssistantState,
  } = useSessionRuntime();
  const [draftText, setDraftText] = useState('');
  const [isSubmittingTextTurn, setIsSubmittingTextTurn] = useState(false);

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

  const handleDraftTextChange = useCallback((event: ChangeEvent<HTMLInputElement>): void => {
    setDraftText(event.currentTarget.value);
  }, []);

  const handleSubmitTextTurnCallback = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();

      const nextDraft = draftText.trim();

      if (!nextDraft || isSubmittingTextTurn) {
        return;
      }

      setIsSubmittingTextTurn(true);

      try {
        const didSend = await handleSubmitTextTurn(nextDraft);

        if (didSend) {
          setDraftText('');
        }
      } finally {
        setIsSubmittingTextTurn(false);
      }
    },
    [draftText, handleSubmitTextTurn, isSubmittingTextTurn],
  );

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
    textSessionStatus,
    textSessionStatusLabel,
    canSubmitText,
    lastRuntimeError,
    draftText,
    isSubmittingTextTurn,
    handleDraftTextChange,
    handleSubmitTextTurn: handleSubmitTextTurnCallback,
    handleCheckBackendHealth: handleCheckBackendHealthCallback,
    handleStartTalking,
  };
}
