import type { ChangeEventHandler, FormEventHandler, KeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '../../../primitives';
import type { AssistantPanelComposerAction } from './assistantPanelComposerAction';

export type AssistantPanelChatComposerProps = {
  composerAction: AssistantPanelComposerAction;
  draftText: string;
  isConversationEmpty: boolean;
  isComposerDisabled: boolean;
  isLiveSessionActive: boolean;
  isPanelOpen: boolean;
  liveSessionPhaseLabel?: string | null;
  placeholder: string;
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
  liveSessionPhaseLabel = null,
  placeholder,
  onDraftTextChange,
  onEndSpeechMode,
  onStartSpeechMode,
  onSubmitTextTurn,
}: AssistantPanelChatComposerProps): JSX.Element {
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isCtaLoading, setIsCtaLoading] = useState(false);

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

  useEffect(() => {
    if (isLiveSessionActive) {
      setIsCtaLoading(false);
    }
  }, [isLiveSessionActive]);

  const handleCtaClick = () => {
    setIsCtaLoading(true);
    void onStartSpeechMode().catch(() => {
      setIsCtaLoading(false);
    });
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
      <div
        className={[
          'assistant-panel__composer-transition',
          isLiveSessionActive && 'assistant-panel__composer-transition--collapsed',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-hidden={isLiveSessionActive || undefined}
      >
        <div className="assistant-panel__inactive-cta">
          <Button
            variant="primary"
            size="md"
            className={[
              'assistant-panel__inactive-cta-button',
              isCtaLoading && 'assistant-panel__inactive-cta-button--loading',
            ]
              .filter(Boolean)
              .join(' ')}
            disabled={composerAction.disabled || isCtaLoading}
            onClick={handleCtaClick}
          >
            {isCtaLoading ? (
              <Loader2 size={18} aria-hidden="true" />
            ) : (
              composerAction.label
            )}
          </Button>
        </div>
      </div>

      {liveSessionPhaseLabel && !isConversationEmpty ? (
        <p className="assistant-panel__session-status" role="status" aria-live="polite">
          {liveSessionPhaseLabel}
        </p>
      ) : null}

      <div
        className={[
          'assistant-panel__composer-transition',
          !isLiveSessionActive && 'assistant-panel__composer-transition--collapsed',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-hidden={!isLiveSessionActive || undefined}
      >
        <form
          ref={formRef}
          className="assistant-panel__composer"
          aria-label="Send a typed note to the Live session"
          onSubmit={handleComposerSubmit}
        >
          <div className="assistant-panel__composer-box">
            <textarea
              ref={textareaRef}
              value={draftText}
              onChange={onDraftTextChange}
              disabled={isComposerDisabled}
              placeholder={placeholder}
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
    </div>
  );
}
