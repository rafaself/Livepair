import { MessageCircle, SendHorizonal, TriangleAlert } from 'lucide-react';
import type { ChangeEventHandler, FormEventHandler } from 'react';
import type { AssistantRuntimeState } from '../../state/assistantUiState';
import type { ConversationTurnModel } from '../../runtime/types';
import { Button, TextInput } from '../primitives';
import { AssistantPanelStateHero } from './AssistantPanelStateHero';
import { ConversationList } from './ConversationList';

export type AssistantPanelChatViewProps = {
  assistantState: AssistantRuntimeState;
  turns: ConversationTurnModel[];
  isConversationEmpty: boolean;
  lastRuntimeError: string | null;
  draftText: string;
  isSubmittingTextTurn: boolean;
  onDraftTextChange: ChangeEventHandler<HTMLInputElement>;
  onSubmitTextTurn: FormEventHandler<HTMLFormElement>;
};

export function AssistantPanelChatView({
  assistantState,
  turns,
  isConversationEmpty,
  lastRuntimeError,
  draftText,
  isSubmittingTextTurn,
  onDraftTextChange,
  onSubmitTextTurn,
}: AssistantPanelChatViewProps): JSX.Element {
  const isComposerDisabled = isSubmittingTextTurn;
  const canSubmit = draftText.trim().length > 0 && !isComposerDisabled;
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
            Send a text prompt to start the realtime loop and keep the latest exchange visible.
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
        {(lastRuntimeError && !isConversationEmpty) ? (
          <div className="assistant-panel__runtime-error" role="alert">
            <TriangleAlert size={16} aria-hidden="true" />
            <p>{lastRuntimeError}</p>
          </div>
        ) : null}
        <ConversationList
          turns={turns}
          emptyState={emptyState}
          className={isConversationEmpty ? undefined : 'assistant-panel__conversation-list'}
        />
        <div className="assistant-panel__bottom-fade" aria-hidden="true" />
        <form
          className="assistant-panel__composer"
          aria-label="Send message to Livepair"
          onSubmit={onSubmitTextTurn}
        >
          <TextInput
            value={draftText}
            onChange={onDraftTextChange}
            disabled={isComposerDisabled}
            placeholder="Ask Livepair"
            className="assistant-panel__composer-input"
            append={
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="assistant-panel__composer-submit"
                disabled={!canSubmit}
                aria-label="Send message"
              >
                <SendHorizonal size={18} aria-hidden="true" />
              </Button>
            }
          />
        </form>
      </section>
    </div>
  );
}
