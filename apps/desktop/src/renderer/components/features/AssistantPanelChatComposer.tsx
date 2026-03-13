import type { ChangeEventHandler, FormEventHandler, KeyboardEvent } from 'react';
import { useEffect, useRef } from 'react';
import { Button } from '../primitives';
import type { AssistantPanelComposerAction } from './assistantPanelComposerAction';

export type AssistantPanelChatComposerProps = {
  composerAction: AssistantPanelComposerAction;
  draftText: string;
  isConversationEmpty: boolean;
  isComposerDisabled: boolean;
  isLiveSessionActive: boolean;
  isPanelOpen: boolean;
  onDraftTextChange: ChangeEventHandler<HTMLTextAreaElement>;
  onEndSpeechMode: () => Promise<void>;
  onStartSpeechMode: () => Promise<void>;
  onSubmitTextTurn: FormEventHandler<HTMLFormElement>;
};

export function AssistantPanelChatComposer({
  composerAction,
  draftText,
  isConversationEmpty,
  isComposerDisabled,
  isLiveSessionActive,
  isPanelOpen,
  onDraftTextChange,
  onEndSpeechMode,
  onStartSpeechMode,
  onSubmitTextTurn,
}: AssistantPanelChatComposerProps): JSX.Element {
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draftText]);

  useEffect(() => {
    if (isPanelOpen && isLiveSessionActive) {
      textareaRef.current?.focus();
    }
  }, [isLiveSessionActive, isPanelOpen]);

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

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter') return;
    if (event.shiftKey) return; // Shift+Enter → insert newline (default)

    // Enter or Ctrl+Enter → prevent default; submit only in send mode
    event.preventDefault();

    if (composerAction.kind === 'send' && draftText.trim()) {
      formRef.current?.requestSubmit();
    }
  };

  if (!isLiveSessionActive) {
    return (
      <div className="assistant-panel__composer-section">
        <div className="assistant-panel__inactive-cta" role="note">
          <div className="assistant-panel__inactive-cta-copy">
            <p className="assistant-panel__inactive-cta-title">
              {isConversationEmpty
                ? 'Start a Live session to continue here'
                : 'This history stays available while inactive'}
            </p>
            <p className="assistant-panel__inactive-cta-body">
              {isConversationEmpty
                ? 'Start Live Session to add turns here. When the session pauses, this container stays visible for context.'
                : 'Resume Live Session to continue with the latest context in this container.'}
            </p>
          </div>
          <Button
            variant="primary"
            size="md"
            className="assistant-panel__inactive-cta-button"
            disabled={composerAction.disabled}
            onClick={() => void onStartSpeechMode()}
          >
            {composerAction.label}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="assistant-panel__composer-section">
      <form
        ref={formRef}
        className="assistant-panel__composer"
        aria-label="Send message to Livepair"
        onSubmit={handleComposerSubmit}
      >
        <div className="assistant-panel__composer-box">
          <textarea
            ref={textareaRef}
            value={draftText}
            onChange={onDraftTextChange}
            disabled={isComposerDisabled}
            placeholder="Ask Livepair"
            className="assistant-panel__composer-textarea"
            onKeyDown={handleKeyDown}
            rows={1}
          />
          <div className="assistant-panel__composer-toolbar">
            <div className="assistant-panel__composer-actions-left">
              {/* Optional actions can go here in the future */}
            </div>
            <div className="assistant-panel__composer-actions-right">
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className={[
                  'assistant-panel__composer-submit',
                  composerAction.kind !== 'send' &&
                    'assistant-panel__composer-submit--speech',
                  composerAction.kind === 'endSpeech' &&
                    !composerAction.isLoading &&
                    'assistant-panel__composer-submit--speech-active',
                  composerAction.isLoading &&
                    'assistant-panel__composer-submit--loading',
                ]
                  .filter(Boolean)
                  .join(' ')}
                disabled={composerAction.disabled}
                aria-label={composerAction.label}
              >
                {composerAction.icon}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
