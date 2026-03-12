import type { ChangeEventHandler, FormEventHandler } from 'react';
import { Button, TextInput } from '../primitives';
import type { AssistantPanelComposerAction } from './assistantPanelComposerAction';

export type AssistantPanelChatComposerProps = {
  composerAction: AssistantPanelComposerAction;
  draftText: string;
  isComposerDisabled: boolean;
  onDraftTextChange: ChangeEventHandler<HTMLInputElement>;
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

  return (
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
          }
        />
      </form>
    </div>
  );
}
