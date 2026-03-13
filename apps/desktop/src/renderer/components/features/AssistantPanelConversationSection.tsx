import { History, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { ConversationList } from './ConversationList';
import type { ConversationTimelineEntry } from '../../runtime/conversation/conversation.types';

export type AssistantPanelConversationSectionProps = {
  emptyState: ReactNode;
  isConversationEmpty: boolean;
  isViewingPastChat?: boolean;
  lastRuntimeError: string | null;
  activeChatTitle?: string | null;
  turns: ConversationTimelineEntry[];
};

export function AssistantPanelConversationSection({
  emptyState,
  isConversationEmpty,
  isViewingPastChat = false,
  lastRuntimeError,
  activeChatTitle = null,
  turns,
}: AssistantPanelConversationSectionProps): JSX.Element {
  return (
    <div className="assistant-panel__messages-section">
      <div className="assistant-panel__messages-header">
        <div className="assistant-panel__history-label" aria-label="Session history">
          <History size={16} />
          <p className="assistant-panel__chat-title">Session history</p>
        </div>
      </div>
      {isViewingPastChat ? (
        <div className="assistant-panel__messages-header">
          <div className="assistant-panel__history-state" role="status" aria-live="polite">
            <p className="assistant-panel__history-state-label">Viewing past chat</p>
            <p className="assistant-panel__history-state-title">
              {activeChatTitle ?? 'Untitled chat'}
            </p>
          </div>
        </div>
      ) : null}
      {lastRuntimeError && !isConversationEmpty ? (
        <div className="assistant-panel__messages-header">
          <div className="assistant-panel__runtime-error" role="alert">
            <TriangleAlert size={16} aria-hidden="true" />
            <p>{lastRuntimeError}</p>
          </div>
        </div>
      ) : null}

      <ConversationList
        turns={turns}
        emptyState={emptyState}
        className={isConversationEmpty ? undefined : 'assistant-panel__conversation-list'}
      />
    </div>
  );
}
