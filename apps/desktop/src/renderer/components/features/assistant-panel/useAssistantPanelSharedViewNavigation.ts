import { useCallback } from 'react';
import {
  createAndSwitchToNewChat,
  switchToChat as switchToPersistedChat,
} from '../../../chatMemory';
import type { PanelView } from '../../../store/uiStore';

type UseAssistantPanelSharedViewNavigationOptions = {
  setPanelView: (view: PanelView) => void;
  resetChatSessionData: () => void;
  switchToChat?: (chatId: string) => Promise<void>;
  createAndSwitchToNewChat?: () => Promise<unknown>;
};

export type AssistantPanelSharedViewNavigation = {
  handleSelectChat: (chatId: string) => Promise<void>;
  handleBackToHistory: () => void;
  handleBackToChat: () => void;
  handleCreateChat: () => Promise<void>;
};

export function useAssistantPanelSharedViewNavigation({
  setPanelView,
  resetChatSessionData,
  switchToChat = switchToPersistedChat,
  createAndSwitchToNewChat: createNewChat = createAndSwitchToNewChat,
}: UseAssistantPanelSharedViewNavigationOptions): AssistantPanelSharedViewNavigation {
  const handleSelectChat = useCallback(
    async (chatId: string): Promise<void> => {
      await switchToChat(chatId);
      setPanelView('chat');
    },
    [setPanelView, switchToChat],
  );

  const handleBackToHistory = useCallback((): void => {
    setPanelView('history');
  }, [setPanelView]);

  const handleBackToChat = useCallback((): void => {
    setPanelView('chat');
  }, [setPanelView]);

  const handleCreateChat = useCallback(async (): Promise<void> => {
    resetChatSessionData();
    setPanelView('chat');
    await createNewChat();
  }, [createNewChat, resetChatSessionData, setPanelView]);

  return {
    handleSelectChat,
    handleBackToHistory,
    handleBackToChat,
    handleCreateChat,
  };
}
