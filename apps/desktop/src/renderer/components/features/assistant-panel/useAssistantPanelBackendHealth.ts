import { useCallback, useEffect } from 'react';

type UseAssistantPanelBackendHealthOptions = {
  isPanelOpen: boolean;
  onCheckBackendHealth: () => Promise<void>;
};

export function useAssistantPanelBackendHealth({
  isPanelOpen,
  onCheckBackendHealth,
}: UseAssistantPanelBackendHealthOptions): () => Promise<void> {
  const handleCheckBackendHealth = useCallback(async (): Promise<void> => {
    await onCheckBackendHealth();
  }, [onCheckBackendHealth]);

  useEffect(() => {
    if (!isPanelOpen) {
      return;
    }

    void handleCheckBackendHealth();
  }, [handleCheckBackendHealth, isPanelOpen]);

  return handleCheckBackendHealth;
}
