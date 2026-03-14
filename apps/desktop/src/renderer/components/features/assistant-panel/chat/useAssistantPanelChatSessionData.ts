import { useCallback, useEffect, useState } from 'react';
import type { ChatRecord, LiveSessionRecord } from '@livepair/shared-types';
import { getChatRecord } from '../../../../chatMemory';
import { getLatestPersistedLiveSession } from '../../../../liveSessions';

type UseAssistantPanelChatSessionDataOptions = {
  activeChatId: string | null;
};

export type AssistantPanelChatSessionData = {
  activeChat: ChatRecord | null;
  latestLiveSession: LiveSessionRecord | null;
  resetChatSessionData: () => void;
};

export function useAssistantPanelChatSessionData({
  activeChatId,
}: UseAssistantPanelChatSessionDataOptions): AssistantPanelChatSessionData {
  const [activeChat, setActiveChat] = useState<ChatRecord | null>(null);
  const [latestLiveSession, setLatestLiveSession] = useState<LiveSessionRecord | null>(null);
  const resetChatSessionData = useCallback((): void => {
    setActiveChat(null);
    setLatestLiveSession(null);
  }, []);

  useEffect(() => {
    let isCancelled = false;

    if (activeChatId === null) {
      resetChatSessionData();
      return () => {
        isCancelled = true;
      };
    }

    void getChatRecord(activeChatId)
      .then((chat) => {
        if (!isCancelled) {
          setActiveChat(chat);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setActiveChat(null);
        }
      });

    void getLatestPersistedLiveSession(activeChatId)
      .then((liveSession) => {
        if (!isCancelled) {
          setLatestLiveSession(liveSession);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setLatestLiveSession(null);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [activeChatId, resetChatSessionData]);

  return {
    activeChat,
    latestLiveSession,
    resetChatSessionData,
  };
}
