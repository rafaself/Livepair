import type { ChangeEventHandler, FormEventHandler, KeyboardEvent } from 'react';
import { useRef } from 'react';
import { Button } from '../primitives';
import type { AssistantPanelComposerAction } from './assistantPanelComposerAction';

export type AssistantPanelChatComposerProps = {
  composerAction: AssistantPanelComposerAction;
  draftText: string;
  isComposerDisabled: boolean;
  onDraftTextChange: ChangeEventHandler<HTMLTextAreaElement>;
  onEndSpeechMode: () => Promise<void>;
  onStartSpeechMode: () => Promise<void>;
  onSubmitTextTurn: FormEventHandler<HTMLFormElement>;
};

export function AssistantPanelChatComposer({
  composerAction,
  draftText,
  isComposerDisabled,
  onDraftTextChange,
  onEndSpeechMode,
  onStartSpeechMode,
  onSubmitTextTurn,
}: AssistantPanelChatComposerProps): JSX.Element {
  const formRef = useRef<HTMLFormElement>(null);

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
