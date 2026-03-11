import { MessageCircle, SendHorizonal, TriangleAlert } from 'lucide-react';
import type { ChangeEventHandler, FormEventHandler } from 'react';
import type { AssistantRuntimeState } from '../../state/assistantUiState';
import type {
  ConversationTurnModel,
  CurrentVoiceTranscript,
  ProductMode,
  TextSessionStatus,
} from '../../runtime/core/types';
import { Button, TextInput } from '../primitives';
import { AssistantPanelStateHero } from './AssistantPanelStateHero';
import { ConversationList } from './ConversationList';
import './AssistantPanelChatView.css';

export type AssistantPanelChatViewProps = {
  assistantState: AssistantRuntimeState;
  currentMode: ProductMode;
  textSessionStatus: TextSessionStatus;
  textSessionStatusLabel: string;
  canSubmitText: boolean;
  turns: ConversationTurnModel[];
  currentVoiceTranscript: CurrentVoiceTranscript;
  isConversationEmpty: boolean;
  lastRuntimeError: string | null;
  draftText: string;
  isSubmittingTextTurn: boolean;
  onDraftTextChange: ChangeEventHandler<HTMLInputElement>;
  onSubmitTextTurn: FormEventHandler<HTMLFormElement>;
};

export function AssistantPanelChatView({
  assistantState,
  currentMode,
  textSessionStatus,
  textSessionStatusLabel,
  canSubmitText,
  turns,
  currentVoiceTranscript,
  isConversationEmpty,
  lastRuntimeError,
  draftText,
  isSubmittingTextTurn,
  onDraftTextChange,
  onSubmitTextTurn,
}: AssistantPanelChatViewProps): JSX.Element {
  const isComposerDisabled = isSubmittingTextTurn || !canSubmitText;
  const canSubmit = draftText.trim().length > 0 && !isComposerDisabled;
  const isSpeechMode = currentMode === 'speech';
  const hasVoiceTranscript =
    currentVoiceTranscript.user.text.trim().length > 0 ||
    currentVoiceTranscript.assistant.text.trim().length > 0;
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
          <p className="assistant-panel__conversation-empty-title">
            {isSpeechMode ? 'Live voice transcript' : 'No conversation yet'}
          </p>
          <p className="assistant-panel__conversation-empty-body">
            {isSpeechMode
              ? 'Speak to start the current voice turn transcript.'
              : 'Send a text prompt to start the realtime loop and keep the latest exchange visible.'}
          </p>
        </>
      )}
    </div>
  );

  return (
    <div className="assistant-panel__view-section">
      <AssistantPanelStateHero state={assistantState} />
      <section
        className="assistant-panel__chat-container"
        aria-label="Conversation"
      >
        <div className="assistant-panel__messages-section">
          <div className="assistant-panel__messages-header">
            <h3 className="assistant-panel__chat-title" id="assistant-panel-chat-title">
              Conversation
            </h3>
            <div
              className={`assistant-panel__text-status assistant-panel__text-status--${textSessionStatus}`}
              role="status"
              aria-live="polite"
            >
              <p>{textSessionStatusLabel}</p>
            </div>
            {lastRuntimeError && !isConversationEmpty && (
              <div className="assistant-panel__runtime-error" role="alert">
                <TriangleAlert size={16} aria-hidden="true" />
                <p>{lastRuntimeError}</p>
              </div>
            )}
          </div>

          {(isSpeechMode || hasVoiceTranscript) ? (
            <section
              className="assistant-panel__voice-transcript"
              aria-label="Current voice turn transcript"
            >
              <h3 className="assistant-panel__voice-transcript-title">Current voice turn</h3>
              <div className="assistant-panel__voice-transcript-rows">
                <div className="assistant-panel__voice-transcript-row">
                  <p className="assistant-panel__voice-transcript-label">You</p>
                  <p className="assistant-panel__voice-transcript-body">
                    {currentVoiceTranscript.user.text || 'Listening for your speech...'}
                  </p>
                </div>
                <div className="assistant-panel__voice-transcript-row">
                  <p className="assistant-panel__voice-transcript-label">Assistant</p>
                  <p className="assistant-panel__voice-transcript-body">
                    {currentVoiceTranscript.assistant.text || 'Waiting for the assistant response...'}
                  </p>
                </div>
              </div>
            </section>
          ) : null}
          <ConversationList
            turns={turns}
            emptyState={emptyState}
            className={isConversationEmpty ? undefined : 'assistant-panel__conversation-list'}
          />
        </div>

        <div className="assistant-panel__composer-section">
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
        </div>
      </section>
    </div>
  );
}
