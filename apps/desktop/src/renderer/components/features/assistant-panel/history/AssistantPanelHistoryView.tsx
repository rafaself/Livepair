import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessageRecord, ChatRecord, LiveSessionRecord } from '@livepair/shared-types';
import { Button } from '../../../primitives';
import './AssistantPanelHistoryView.css';

export type AssistantPanelHistoryViewProps = {
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
};

type ChatHistoryListItem = {
  chat: ChatRecord;
  preview: string;
  latestSessionLabel: string | null;
  resumeLabel: string | null;
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

function formatPreview(messages: readonly ChatMessageRecord[]): string {
  const latestMessage = messages[messages.length - 1] ?? null;

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
}: AssistantPanelHistoryViewProps): JSX.Element {
  const [chatItems, setChatItems] = useState<ChatHistoryListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
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
      const chats = await window.bridge.listChats();
      const result = await Promise.all(
        chats.map(async (chat) => {
          const [messages, liveSessions] = await Promise.all([
            window.bridge.listChatMessages(chat.id),
            window.bridge.listLiveSessions(chat.id),
          ]);
          const latestLiveSession = liveSessions[0] ?? null;

          return {
            chat,
            preview: formatPreview(messages),
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
    const mode = hasLoadedOnceRef.current ? 'refresh' : 'initial';
    hasLoadedOnceRef.current = true;
    void loadChats(mode);
  }, [activeChatId, loadChats]);

  if (isLoading) {
    return (
      <div className="chat-history">
        <div className="chat-history__toolbar">
          <p className="chat-history__label">Past chats</p>
          <Button variant="ghost" size="sm" disabled>
            Refresh history
          </Button>
        </div>
        <p className="chat-history__empty">Loading…</p>
      </div>
    );
  }

  if (loadError !== null && chatItems.length === 0) {
    return (
      <div className="chat-history">
        <div className="chat-history__toolbar">
          <p className="chat-history__label">Past chats</p>
          <Button
            variant="ghost"
            size="sm"
            disabled={isRefreshing}
            onClick={() => {
              void loadChats('refresh');
            }}
          >
            Refresh history
          </Button>
        </div>
        <p className="chat-history__empty">{loadError}</p>
      </div>
    );
  }

  if (chatItems.length === 0) {
    return (
      <div className="chat-history">
        <div className="chat-history__toolbar">
          <p className="chat-history__label">Past chats</p>
          <Button
            variant="ghost"
            size="sm"
            disabled={isRefreshing}
            onClick={() => {
              void loadChats('refresh');
            }}
          >
            Refresh history
          </Button>
        </div>
        <p className="chat-history__empty">No past chats yet.</p>
      </div>
    );
  }

  return (
    <div className="chat-history">
      <div className="chat-history__toolbar">
        <p className="chat-history__label">Past chats</p>
        <Button
          variant="ghost"
          size="sm"
          disabled={isRefreshing}
          onClick={() => {
            void loadChats('refresh');
          }}
        >
          {isRefreshing ? 'Refreshing…' : 'Refresh history'}
        </Button>
      </div>
      {loadError ? (
        <p className="chat-history__status" role="status">
          {loadError}
        </p>
      ) : null}
      <ul className="chat-history__list" role="list">
        {chatItems.map(({ chat, preview, latestSessionLabel, resumeLabel }) => (
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
                <span className="chat-history__badges" aria-label="Chat relationship and latest session">
                  {chat.isCurrent ? (
                    <span className="chat-history__badge">Current chat</span>
                  ) : null}
                  {chat.id === activeChatId && !chat.isCurrent ? (
                    <span className="chat-history__badge">Opened now</span>
                  ) : null}
                  {latestSessionLabel ? (
                    <span className="chat-history__badge">{latestSessionLabel}</span>
                  ) : null}
                  {resumeLabel ? (
                    <span className="chat-history__badge">{resumeLabel}</span>
                  ) : null}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
