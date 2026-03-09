import { MessageCircle } from 'lucide-react';
import type { AssistantRuntimeState } from '../../state/assistantUiState';
import type { ConversationTurnModel } from './mockConversation';
import { useUiStore } from '../../store/uiStore';
import { AssistantPanelStateHero } from './AssistantPanelStateHero';
import { ConversationList } from './ConversationList';
import { Badge, Button } from '../primitives';

export type AssistantPanelChatViewProps = {
  assistantState: AssistantRuntimeState;
  turns: ConversationTurnModel[];
  isConversationEmpty: boolean;
};

export function AssistantPanelChatView({
  assistantState,
  turns,
  isConversationEmpty,
}: AssistantPanelChatViewProps): JSX.Element {
  const primarySettingsIssue = useUiStore((state) => state.settingsIssues[0] ?? null);
  const openSettingsForTarget = useUiStore((state) => state.openSettingsForTarget);

  return (
    <div className="assistant-panel__view-section">
      {primarySettingsIssue ? (
        <div className="assistant-panel__warning-summary" role="status" aria-live="polite">
          <Badge variant="warning">Warning</Badge>
          <p>{primarySettingsIssue.summary}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openSettingsForTarget(primarySettingsIssue.focusTarget)}
          >
            Fix
          </Button>
        </div>
      ) : null}
      <AssistantPanelStateHero state={assistantState} />
      <section
        className="assistant-panel__conversation"
        aria-labelledby="assistant-panel-conversation-title"
      >
        <h3 id="assistant-panel-conversation-title">Conversation</h3>
        <ConversationList
          turns={turns}
          emptyState={(
            <div className="assistant-panel__conversation-card assistant-panel__conversation-card--empty">
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
            </div>
          )}
          className={isConversationEmpty ? undefined : 'assistant-panel__conversation-list'}
        />
        <div className="assistant-panel__bottom-fade" aria-hidden="true" />
      </section>
    </div>
  );
}
