import { MessageCircle, Mic, MicOff, SendHorizonal, TriangleAlert } from 'lucide-react';
import type { ChangeEventHandler, FormEventHandler } from 'react';
import type { AssistantRuntimeState } from '../../state/assistantUiState';
import type { ConversationTurnModel } from '../../runtime/conversation/conversation.types';
import type { CurrentVoiceTranscript } from '../../runtime/voice/voice.types';
import type { ProductMode } from '../../runtime/core/session.types';
import {
  canEndSpeechMode,
  canSubmitComposerText,
  createControlGatingSnapshot,
  getComposerSpeechActionKind,
} from '../../runtime/controlGating';
import type { SpeechLifecycleStatus } from '../../runtime/speech/speech.types';
import type { TextSessionStatus } from '../../runtime/text/text.types';
import type { TransportKind } from '../../runtime/transport/transport.types';
import type { VoiceSessionStatus } from '../../runtime/voice/voice.types';
import { Button, TextInput } from '../primitives';
import { AssistantPanelStateHero } from './AssistantPanelStateHero';
import { ConversationList } from './ConversationList';
import './AssistantPanelChatView.css';

export type AssistantPanelChatViewProps = {
  assistantState: AssistantRuntimeState;
  currentMode: ProductMode;
  speechLifecycleStatus: SpeechLifecycleStatus;
  textSessionStatus: TextSessionStatus;
  textSessionStatusLabel: string;
  canSubmitText: boolean;
  activeTransport?: TransportKind | null;
  voiceSessionStatus?: VoiceSessionStatus;
  turns: ConversationTurnModel[];
  currentVoiceTranscript: CurrentVoiceTranscript;
  isConversationEmpty: boolean;
  lastRuntimeError: string | null;
  draftText: string;
  isSubmittingTextTurn: boolean;
  onDraftTextChange: ChangeEventHandler<HTMLInputElement>;
  onSubmitTextTurn: FormEventHandler<HTMLFormElement>;
  onStartSpeechMode: () => Promise<void>;
  onEndSpeechMode: () => Promise<void>;
};

export function AssistantPanelChatView({
  assistantState,
  currentMode,
  speechLifecycleStatus,
  textSessionStatus,
  textSessionStatusLabel,
  canSubmitText,
  activeTransport = null,
  voiceSessionStatus = 'disconnected',
  turns,
  currentVoiceTranscript,
  isConversationEmpty,
  lastRuntimeError,
  draftText,
  isSubmittingTextTurn,
  onDraftTextChange,
  onSubmitTextTurn,
  onStartSpeechMode,
  onEndSpeechMode,
}: AssistantPanelChatViewProps): JSX.Element {
  const controlGatingSnapshot = createControlGatingSnapshot({
    currentMode,
    speechLifecycleStatus,
    textSessionStatus,
    activeTransport,
    voiceSessionStatus,
  });
  const isComposerDisabled =
    isSubmittingTextTurn ||
    !canSubmitText ||
    !canSubmitComposerText(controlGatingSnapshot);
  const hasDraftText = draftText.trim().length > 0;
  const isSpeechMode = currentMode === 'speech';
  const composerSpeechActionKind = getComposerSpeechActionKind(controlGatingSnapshot);
  const hasVoiceTranscript =
    currentVoiceTranscript.user.text.trim().length > 0 ||
    currentVoiceTranscript.assistant.text.trim().length > 0;
  const composerAction = hasDraftText
    ? {
        icon: <SendHorizonal size={18} aria-hidden="true" />,
        kind: 'send' as const,
        label: 'Send message',
        disabled: isComposerDisabled,
      }
    : composerSpeechActionKind === 'end'
      ? {
          icon: <MicOff size={18} aria-hidden="true" />,
          kind: 'endSpeech' as const,
          label:
            speechLifecycleStatus === 'starting'
              ? 'Starting speech mode'
              : speechLifecycleStatus === 'ending'
                ? 'Ending speech mode'
                : 'End speech mode',
          disabled: !canEndSpeechMode(controlGatingSnapshot),
        }
      : {
          icon: <Mic size={18} aria-hidden="true" />,
          kind: 'startSpeech' as const,
          label: 'Start speech mode',
          disabled: false,
        };

  const handleComposerSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    if (composerAction.kind === 'send') {
      onSubmitTextTurn(event);
      return;
    }

    event.preventDefault();

    if (composerAction.disabled) {
      return;
    }

    if (composerAction.kind === 'startSpeech') {
      void onStartSpeechMode();
      return;
    }

    void onEndSpeechMode();
  };

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
            onSubmit={handleComposerSubmit}
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
                  disabled={composerAction.disabled}
                  aria-label={composerAction.label}
                >
                  {composerAction.icon}
                </Button>
              }
            />
          </form>
        </div>
      </section>
    </div>
  );
}
