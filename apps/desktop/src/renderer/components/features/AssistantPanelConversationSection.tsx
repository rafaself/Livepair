import { History, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { ConversationList } from './ConversationList';
import type { ConversationTimelineEntry } from '../../runtime/conversation/conversation.types';
import { Button } from '../primitives';

export type AssistantPanelConversationSectionProps = {
  emptyState: ReactNode;
  isConversationEmpty: boolean;
  lastRuntimeError: string | null;
  turns: ConversationTimelineEntry[];
};

export function AssistantPanelConversationSection({
  emptyState,
  isConversationEmpty,
  lastRuntimeError,
  turns,
}: AssistantPanelConversationSectionProps): JSX.Element {
  return (
    <div className="assistant-panel__messages-section">
      <div className="assistant-panel__messages-header">
        <Button
          variant="ghost"
          size="sm"
          aria-label="History"
          className="assistant-panel__history-btn"
        >
          <History size={16} />
        </Button>
      </div>
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
