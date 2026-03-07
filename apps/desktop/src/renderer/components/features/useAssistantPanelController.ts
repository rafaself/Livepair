import { useCallback, useEffect, useState } from 'react';
import type { AssistantRuntimeState } from '../../state/assistantUiState';
import { checkBackendHealth, requestSessionToken } from '../../api/backend';
import { useUiStore, type PanelView } from '../../store/uiStore';

export type BackendConnectionState = 'idle' | 'checking' | 'connected' | 'failed';
export type TokenRequestState = 'idle' | 'loading' | 'success' | 'error';

export type AssistantPanelController = {
  assistantState: AssistantRuntimeState;
  isPanelOpen: boolean;
  panelView: PanelView;
  setPanelView: (view: PanelView) => void;
  closePanel: () => void;
  setAssistantState: (state: AssistantRuntimeState) => void;
  backendState: BackendConnectionState;
  backendIndicatorState: AssistantRuntimeState;
  backendLabel: string;
  tokenRequestState: TokenRequestState;
  tokenFeedback: string | null;
  handleCheckBackendHealth: () => Promise<void>;
  handleStartTalking: () => Promise<void>;
};

export function useAssistantPanelController(): AssistantPanelController {
  const {
    state: { assistantState, isPanelOpen, panelView },
    closePanel,
    setPanelView,
    setAssistantState,
  } = useUiStore();
  const [backendState, setBackendState] = useState<BackendConnectionState>('idle');
  const [tokenRequestState, setTokenRequestState] = useState<TokenRequestState>('idle');

  const handleCheckBackendHealth = useCallback(async (): Promise<void> => {
    setBackendState('checking');
    try {
      const isHealthy = await checkBackendHealth();
      setBackendState(isHealthy ? 'connected' : 'failed');
      setAssistantState(isHealthy ? 'ready' : 'error');
    } catch {
      setBackendState('failed');
      setAssistantState('error');
    }
  }, [setAssistantState]);

  useEffect(() => {
    if (!isPanelOpen) {
      return;
    }

    void handleCheckBackendHealth();
  }, [handleCheckBackendHealth, isPanelOpen]);

  const handleStartTalking = useCallback(async (): Promise<void> => {
    setTokenRequestState('loading');
    setAssistantState('thinking');
    try {
      await requestSessionToken({});
      setTokenRequestState('success');
      setAssistantState('ready');
    } catch {
      setTokenRequestState('error');
      setAssistantState('error');
    }
  }, [setAssistantState]);

  const backendIndicatorState: AssistantRuntimeState =
    backendState === 'connected'
      ? 'ready'
      : backendState === 'checking'
        ? 'thinking'
        : backendState === 'failed'
          ? 'error'
          : 'disconnected';

  const backendLabel =
    backendState === 'connected'
      ? 'Connected'
      : backendState === 'checking'
        ? 'Checking backend...'
        : 'Not connected';

  const tokenFeedback =
    tokenRequestState === 'loading'
      ? 'Requesting token...'
      : tokenRequestState === 'success'
        ? 'Token received'
        : tokenRequestState === 'error'
          ? 'Connection failed'
          : null;

  return {
    assistantState,
    isPanelOpen,
    panelView,
    setPanelView,
    closePanel,
    setAssistantState,
    backendState,
    backendIndicatorState,
    backendLabel,
    tokenRequestState,
    tokenFeedback,
    handleCheckBackendHealth,
    handleStartTalking,
  };
}
