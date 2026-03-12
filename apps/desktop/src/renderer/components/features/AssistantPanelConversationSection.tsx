import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { ConversationList } from './ConversationList';
import type { ConversationTurnModel } from '../../runtime/conversation/conversation.types';

export type AssistantPanelConversationSectionProps = {
  emptyState: ReactNode;
  isConversationEmpty: boolean;
  lastRuntimeError: string | null;
  turns: ConversationTurnModel[];
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
        <h3 className="assistant-panel__chat-title" id="assistant-panel-chat-title">
          Conversation
        </h3>
        {lastRuntimeError && !isConversationEmpty ? (
          <div className="assistant-panel__runtime-error" role="alert">
            <TriangleAlert size={16} aria-hidden="true" />
            <p>{lastRuntimeError}</p>
          </div>
        ) : null}
      </div>

      <ConversationList
        turns={turns}
        emptyState={emptyState}
        className={isConversationEmpty ? undefined : 'assistant-panel__conversation-list'}
      />
    </div>
  );
}
