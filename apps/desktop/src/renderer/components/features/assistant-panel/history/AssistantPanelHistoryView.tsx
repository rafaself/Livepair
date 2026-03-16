import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessageRecord, ChatRecord, LiveSessionRecord } from '@livepair/shared-types';
import {
  getLatestPersistedChatMessage,
  listPersistedChats,
} from '../../../../chatMemory';
import { getLatestPersistedLiveSession } from '../../../../liveSessions';
import './AssistantPanelHistoryView.css';

export type AssistantPanelHistoryViewProps = {
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  viewModel: AssistantPanelHistoryViewModel;
};

type ChatHistoryListItem = {
  chat: ChatRecord;
  preview: string;
  latestSessionLabel: string | null;
  resumeLabel: string | null;
};

function buildHistoryBadges({
  activeChatId,
  chat,
  latestSessionLabel,
  resumeLabel,
}: {
  activeChatId: string | null;
  chat: ChatRecord;
  latestSessionLabel: string | null;
  resumeLabel: string | null;
}): string[] {
  const badges: string[] = [];

  if (chat.id === activeChatId) {
    badges.push('Opened now');
  } else if (chat.isCurrent) {
    badges.push('Current chat');
  }

  if (latestSessionLabel !== null) {
    badges.push(latestSessionLabel);
  }

  if (resumeLabel !== null) {
    badges.push(resumeLabel);
  }

  return badges;
}

export type AssistantPanelHistoryViewModel = {
  chatItems: ChatHistoryListItem[];
  isLoading: boolean;
  loadError: string | null;
};

function formatChatDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  if (diffDays === 1) {
    return 'Yesterday';
  }

  if (diffDays < 7) {
    return date.toLocaleDateString(undefined, { weekday: 'long' });
  }

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatPreview(latestMessage: ChatMessageRecord | null): string {
  if (latestMessage === null) {
    return 'No saved turns yet.';
  }

  return latestMessage.contentText.replace(/\s+/g, ' ').trim().slice(0, 96);
}

function getLatestSessionLabel(session: LiveSessionRecord | null): string | null {
  if (session === null) {
    return null;
  }

  if (session.status === 'failed') {
    return 'Latest session ended unexpectedly';
  }

  if (session.status === 'ended') {
    return 'Latest session ended';
  }

  return 'Latest session active';
}

function getResumeLabel(session: LiveSessionRecord | null): string | null {
  if (session === null) {
    return null;
  }

  return session.restorable && session.resumptionHandle !== null && session.invalidatedAt === null
    ? 'Resume may be available'
    : null;
}

export function AssistantPanelHistoryView({
  activeChatId,
  onSelectChat,
  viewModel,
}: AssistantPanelHistoryViewProps): JSX.Element {
  const { chatItems, isLoading, loadError } = viewModel;

  if (isLoading) {
    return (
      <div className="chat-history">
        <p className="chat-history__empty">Loading…</p>
      </div>
    );
  }

  if (loadError !== null && chatItems.length === 0) {
    return (
      <div className="chat-history">
        <p className="chat-history__empty">{loadError}</p>
      </div>
    );
  }

  if (chatItems.length === 0) {
    return (
      <div className="chat-history">
        <p className="chat-history__empty">No past chats yet.</p>
      </div>
    );
  }

  return (
    <div className="chat-history">
      {loadError ? (
        <p className="chat-history__status" role="status">
          {loadError}
        </p>
      ) : null}
      <ul className="chat-history__list" role="list">
        {chatItems.map(({ chat, preview, latestSessionLabel, resumeLabel }) => {
          const badges = buildHistoryBadges({
            activeChatId,
            chat,
            latestSessionLabel,
            resumeLabel,
          });

          return (
            <li key={chat.id} className="chat-history__item">
              <button
                type="button"
                className={
                  chat.id === activeChatId
                    ? 'chat-history__btn chat-history__btn--active'
                    : 'chat-history__btn'
                }
                onClick={() => onSelectChat(chat.id)}
                aria-current={chat.id === activeChatId ? 'true' : undefined}
              >
                <span className="chat-history__content">
                  <span className="chat-history__row">
                    <span className="chat-history__title">
                      {chat.title ?? 'Untitled chat'}
                    </span>
                    <span className="chat-history__date">
                      {formatChatDate(chat.updatedAt)}
                    </span>
                  </span>
                  <span className="chat-history__preview">{preview}</span>
                  {badges.length > 0 ? (
                    <span className="chat-history__badges">
                      {badges.map((badge) => (
                        <span key={badge} className="chat-history__badge">
                          {badge}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function useAssistantPanelHistoryViewModel({
  activeChatId,
  isEnabled,
}: {
  activeChatId: string | null;
  isEnabled: boolean;
}): AssistantPanelHistoryViewModel {
  const [chatItems, setChatItems] = useState<ChatHistoryListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const latestRequestIdRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);

  const loadChats = useCallback(async (mode: 'initial' | 'refresh' = 'initial'): Promise<void> => {
    const requestId = latestRequestIdRef.current + 1;
    latestRequestIdRef.current = requestId;

    if (mode === 'initial') {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    setLoadError(null);

    try {
      const chats = await listPersistedChats();
      const result = await Promise.all(
        chats.map(async (chat) => {
          const [latestMessage, latestLiveSession] = await Promise.all([
            getLatestPersistedChatMessage(chat.id),
            getLatestPersistedLiveSession(chat.id),
          ]);

          return {
            chat,
            preview: formatPreview(latestMessage),
            latestSessionLabel: getLatestSessionLabel(latestLiveSession),
            resumeLabel: getResumeLabel(latestLiveSession),
          } satisfies ChatHistoryListItem;
        }),
      );

      if (latestRequestIdRef.current !== requestId) {
        return;
      }

      setChatItems(result);
    } catch {
      if (latestRequestIdRef.current !== requestId) {
        return;
      }

      setLoadError(mode === 'initial' ? 'Could not load chat history.' : 'Could not refresh chat history.');
    } finally {
      if (latestRequestIdRef.current !== requestId) {
        return;
      }

      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    const mode = hasLoadedOnceRef.current ? 'refresh' : 'initial';
    hasLoadedOnceRef.current = true;
    void loadChats(mode);
  }, [activeChatId, isEnabled, loadChats]);

  return {
    chatItems,
    isLoading,
    loadError,
  };
}
