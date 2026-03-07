import { useCallback, useEffect, useState } from 'react';
import type { AssistantRuntimeState } from '../../state/assistantUiState';
import { checkBackendHealth, requestSessionToken } from '../../api/backend';
import { useUiStore } from '../../store/uiStore';

export type BackendConnectionState = 'idle' | 'checking' | 'connected' | 'failed';
export type TokenRequestState = 'idle' | 'loading' | 'success' | 'error';

export type AssistantPanelController = {
  assistantState: AssistantRuntimeState;
  isPanelOpen: boolean;
  isSettingsOpen: boolean;
  closePanel: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  setAssistantState: (state: AssistantRuntimeState) => void;
  backendState: BackendConnectionState;
  backendIndicatorState: AssistantRuntimeState;
  backendLabel: string;
  tokenRequestState: TokenRequestState;
  tokenFeedback: string | null;
  handleCheckBackendHealth: () => Promise<void>;
  handleConnect: () => Promise<void>;
};

export function useAssistantPanelController(): AssistantPanelController {
  const {
    state: { assistantState, isPanelOpen, isSettingsOpen },
    closePanel,
    openSettings,
    closeSettings,
    setAssistantState,
  } = useUiStore();
  const [backendState, setBackendState] = useState<BackendConnectionState>('idle');
  const [tokenRequestState, setTokenRequestState] = useState<TokenRequestState>('idle');

  const handleCheckBackendHealth = useCallback(async (): Promise<void> => {
    setBackendState('checking');
    const isHealthy = await checkBackendHealth();
    setBackendState(isHealthy ? 'connected' : 'failed');
  }, []);

  useEffect(() => {
    if (!isPanelOpen) {
      return;
    }

    void handleCheckBackendHealth();
  }, [handleCheckBackendHealth, isPanelOpen]);

  const handleConnect = useCallback(async (): Promise<void> => {
    setTokenRequestState('loading');
    try {
      await requestSessionToken({});
      setTokenRequestState('success');
    } catch {
      setTokenRequestState('error');
    }
  }, []);

  const backendIndicatorState: AssistantRuntimeState =
    backendState === 'connected'
      ? 'ready'
      : backendState === 'checking'
        ? 'connecting'
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
    isSettingsOpen,
    closePanel,
    openSettings,
    closeSettings,
    setAssistantState,
    backendState,
    backendIndicatorState,
    backendLabel,
    tokenRequestState,
    tokenFeedback,
    handleCheckBackendHealth,
    handleConnect,
  };
}
