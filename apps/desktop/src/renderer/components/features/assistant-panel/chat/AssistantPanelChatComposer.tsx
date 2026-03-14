import { ChevronDown, Mic, MicOff } from 'lucide-react';
import type { ChangeEventHandler, FormEventHandler, KeyboardEvent } from 'react';
import { useEffect, useId, useMemo, useRef } from 'react';
import { FloatingLayer } from '../../../layout/FloatingLayer';
import { useFloatingLayer } from '../../../../hooks/useFloatingLayer';
import {
  Button,
  IconButton,
  SelectContent,
  SelectOption,
  type SelectOptionItem,
} from '../../../primitives';
import type { AssistantPanelComposerAction } from './assistantPanelComposerAction';

export type AssistantPanelChatComposerProps = {
  composerAction: AssistantPanelComposerAction;
  draftText: string;
  isConversationEmpty: boolean;
  isComposerDisabled: boolean;
  isComposerMicrophoneEnabled?: boolean;
  isLiveSessionActive: boolean;
  isPanelOpen: boolean;
  inputDeviceOptions?: readonly SelectOptionItem[];
  liveSessionPhaseLabel?: string | null;
  placeholder: string;
  screenCaptureSourceOptions?: readonly SelectOptionItem[];
  selectedInputDeviceId?: string;
  selectedScreenCaptureSourceId?: string;
  onDraftTextChange: ChangeEventHandler<HTMLTextAreaElement>;
  onEndSpeechMode: () => Promise<void>;
  onSelectComposerInputDevice?: (deviceId: string) => void;
  onSelectComposerScreenSource?: (sourceId: string) => void;
  onStartSpeechMode: () => Promise<void>;
  onToggleComposerMicrophone?: () => Promise<void>;
  onSubmitTextTurn: FormEventHandler<HTMLFormElement>;
};

export function AssistantPanelChatComposer({
  composerAction,
  draftText,
  isConversationEmpty,
  isComposerDisabled,
  isComposerMicrophoneEnabled = true,
  isLiveSessionActive,
  isPanelOpen,
  inputDeviceOptions = [],
  liveSessionPhaseLabel = null,
  placeholder,
  screenCaptureSourceOptions = [],
  selectedInputDeviceId = '',
  selectedScreenCaptureSourceId = '',
  onDraftTextChange,
  onEndSpeechMode,
  onSelectComposerInputDevice = () => undefined,
  onSelectComposerScreenSource = () => undefined,
  onStartSpeechMode,
  onToggleComposerMicrophone = async () => undefined,
  onSubmitTextTurn,
}: AssistantPanelChatComposerProps): JSX.Element {
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const leftControlsRef = useRef<HTMLDivElement>(null);
  const sourceDropdownId = useId();
  const sourceDropdown = useFloatingLayer();

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

  // The composer is visible whenever there is history or a live session is active.
  // For a fresh/empty session the entry CTA lives in the centered empty state instead.
  const isComposerCollapsed = isConversationEmpty && !isLiveSessionActive;
  const selectedInputDeviceLabel = useMemo(() => {
    return (
      inputDeviceOptions.find((option) => option.value === selectedInputDeviceId)?.label ??
      'No microphone selected'
    );
  }, [inputDeviceOptions, selectedInputDeviceId]);
  const selectedScreenCaptureSourceLabel = useMemo(() => {
    return (
      screenCaptureSourceOptions.find((option) => option.value === selectedScreenCaptureSourceId)
        ?.label ?? 'No screen source selected'
    );
  }, [screenCaptureSourceOptions, selectedScreenCaptureSourceId]);

  useEffect(() => {
    if (isComposerCollapsed && sourceDropdown.shouldRender) {
      sourceDropdown.close();
    }
  }, [isComposerCollapsed, sourceDropdown]);

  return (
    <div className="assistant-panel__composer-section">
      {liveSessionPhaseLabel && !isConversationEmpty ? (
        <p className="assistant-panel__session-status" role="status" aria-live="polite">
          {liveSessionPhaseLabel}
        </p>
      ) : null}

      <div
        className={[
          'assistant-panel__composer-transition',
          isComposerCollapsed && 'assistant-panel__composer-transition--collapsed',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-hidden={isComposerCollapsed || undefined}
      >
        <form
          ref={formRef}
          className="assistant-panel__composer"
          aria-label="Send a typed note to the Live session"
          onSubmit={handleComposerSubmit}
        >
          <div className="assistant-panel__composer-box">
            <div
              className="assistant-panel__composer-layout"
              data-testid="assistant-panel-composer-layout"
            >
              <div
                className="assistant-panel__composer-left-controls"
                data-testid="assistant-panel-composer-left-controls"
                ref={leftControlsRef}
              >
                <IconButton
                  label={isComposerMicrophoneEnabled ? 'Disable microphone' : 'Enable microphone'}
                  size="sm"
                  className={[
                    'assistant-panel__composer-control',
                    isComposerMicrophoneEnabled
                      ? 'assistant-panel__composer-control--active'
                      : 'assistant-panel__composer-control--inactive',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-pressed={isComposerMicrophoneEnabled}
                  onClick={() => {
                    void onToggleComposerMicrophone();
                  }}
                >
                  {isComposerMicrophoneEnabled ? (
                    <Mic size={16} aria-hidden="true" />
                  ) : (
                    <MicOff size={16} aria-hidden="true" />
                  )}
                </IconButton>

                <IconButton
                  label="Input options"
                  size="sm"
                  className="assistant-panel__composer-control"
                  aria-controls={sourceDropdownId}
                  aria-expanded={sourceDropdown.isOpen}
                  aria-haspopup="dialog"
                  onClick={sourceDropdown.toggle}
                >
                  <ChevronDown size={16} aria-hidden="true" />
                </IconButton>

                <FloatingLayer
                  triggerRef={leftControlsRef}
                  isOpen={sourceDropdown.isOpen}
                  isClosing={sourceDropdown.isClosing}
                  estimatedItemCount={inputDeviceOptions.length + screenCaptureSourceOptions.length + 6}
                  onDismiss={sourceDropdown.close}
                  className="assistant-panel__composer-dropdown-layer"
                  positionOptions={{
                    horizontalAlign: 'start',
                    widthMode: 'minAnchor',
                    minWidthPx: 248,
                    maxWidthPx: 320,
                    flipInLowerHalfOnly: true,
                  }}
                >
                  <div
                    id={sourceDropdownId}
                    role="dialog"
                    aria-label="Source selection"
                    className="assistant-panel__composer-source-dropdown"
                  >
                    <section className="assistant-panel__composer-source-group">
                      <div className="assistant-panel__composer-source-group-header">
                        <p className="assistant-panel__composer-source-group-title">
                          Microphone input
                        </p>
                        <p className="assistant-panel__composer-source-group-current">
                          Current: {selectedInputDeviceLabel}
                        </p>
                      </div>
                      <SelectContent
                        isClosing={sourceDropdown.isClosing}
                        aria-label="Microphone input options"
                        className="assistant-panel__composer-source-list"
                      >
                        {inputDeviceOptions.map((option) => {
                          return (
                            <SelectOption
                              key={option.value}
                              selected={option.value === selectedInputDeviceId}
                              onSelect={() => {
                                onSelectComposerInputDevice(option.value);
                              }}
                            >
                              {option.label}
                            </SelectOption>
                          );
                        })}
                      </SelectContent>
                    </section>

                    <section className="assistant-panel__composer-source-group">
                      <div className="assistant-panel__composer-source-group-header">
                        <p className="assistant-panel__composer-source-group-title">
                          Screen source
                        </p>
                        <p className="assistant-panel__composer-source-group-current">
                          Current: {selectedScreenCaptureSourceLabel}
                        </p>
                      </div>
                      <SelectContent
                        isClosing={sourceDropdown.isClosing}
                        aria-label="Screen source options"
                        className="assistant-panel__composer-source-list"
                      >
                        {screenCaptureSourceOptions.map((option) => {
                          return (
                            <SelectOption
                              key={option.value}
                              selected={option.value === selectedScreenCaptureSourceId}
                              onSelect={() => {
                                onSelectComposerScreenSource(option.value);
                              }}
                            >
                              {option.label}
                            </SelectOption>
                          );
                        })}
                      </SelectContent>
                    </section>
                  </div>
                </FloatingLayer>
              </div>

              <div
                className="assistant-panel__composer-main"
                data-testid="assistant-panel-composer-main"
              >
                <div
                  className={[
                    'assistant-panel__composer-input-transition',
                    (!isLiveSessionActive || composerAction.isLoading) &&
                      'assistant-panel__composer-input-transition--collapsed',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-hidden={!isLiveSessionActive || composerAction.isLoading || undefined}
                >
                  <div>
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
                  </div>
                </div>
              </div>

              <div
                className="assistant-panel__composer-right-action"
                data-testid="assistant-panel-composer-right-action"
              >
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  className={[
                    'assistant-panel__composer-submit',
                    composerAction.variant !== 'default' &&
                      'assistant-panel__composer-submit--speech',
                    composerAction.variant === 'speechPill' &&
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
