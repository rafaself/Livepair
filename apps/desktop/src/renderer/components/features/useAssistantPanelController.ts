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
  isDebugOpen: boolean;
  closePanel: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  openDebug: () => void;
  closeDebug: () => void;
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
    state: { assistantState, isPanelOpen, isSettingsOpen },
    closePanel,
    openSettings,
    closeSettings,
    setAssistantState,
  } = useUiStore();
  const [backendState, setBackendState] = useState<BackendConnectionState>('idle');
  const [tokenRequestState, setTokenRequestState] = useState<TokenRequestState>('idle');
  const [isDebugOpen, setIsDebugOpen] = useState(false);

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

  useEffect(() => {
    if (!isPanelOpen) {
      setIsDebugOpen(false);
    }
  }, [isPanelOpen]);

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
    isSettingsOpen,
    isDebugOpen,
    closePanel,
    openSettings,
    closeSettings,
    openDebug: () => setIsDebugOpen(true),
    closeDebug: () => setIsDebugOpen(false),
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
