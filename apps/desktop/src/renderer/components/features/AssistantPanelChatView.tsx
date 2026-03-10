import { MessageCircle } from 'lucide-react';
import type { AssistantRuntimeState } from '../../state/assistantUiState';
import type { ConversationTurnModel } from '../../runtime/types';
import { AssistantPanelStateHero } from './AssistantPanelStateHero';
import { ConversationList } from './ConversationList';

export type AssistantPanelChatViewProps = {
  assistantState: AssistantRuntimeState;
  turns: ConversationTurnModel[];
  isConversationEmpty: boolean;
  lastRuntimeError: string | null;
};

export function AssistantPanelChatView({
  assistantState,
  turns,
  isConversationEmpty,
  lastRuntimeError,
}: AssistantPanelChatViewProps): JSX.Element {
  const emptyState = (
    <div className="assistant-panel__conversation-card assistant-panel__conversation-card--empty">
      {assistantState === 'error' && lastRuntimeError ? (
        <>
          <p className="assistant-panel__conversation-empty-title">Session failed</p>
          <p className="assistant-panel__conversation-empty-body">{lastRuntimeError}</p>
          <p className="assistant-panel__conversation-empty-body">
            Start the session again from the dock to reconnect.
          </p>
        </>
      ) : (
        <>
          <MessageCircle
            size={56}
            strokeWidth={1.25}
            className="assistant-panel__conversation-empty-icon"
            aria-hidden="true"
          />
          <p className="assistant-panel__conversation-empty-title">No conversation yet</p>
          <p className="assistant-panel__conversation-empty-body">
            When you start talking, Livepair will keep the latest exchange here so you can
            stay oriented in the flow.
          </p>
        </>
      )}
    </div>
  );

  return (
    <div className="assistant-panel__view-section">
      <AssistantPanelStateHero state={assistantState} />
      <section
        className="assistant-panel__conversation"
        aria-labelledby="assistant-panel-conversation-title"
      >
        <h3 id="assistant-panel-conversation-title">Conversation</h3>
        <ConversationList
          turns={turns}
          emptyState={emptyState}
          className={isConversationEmpty ? undefined : 'assistant-panel__conversation-list'}
        />
        <div className="assistant-panel__bottom-fade" aria-hidden="true" />
      </section>
    </div>
  );
}
