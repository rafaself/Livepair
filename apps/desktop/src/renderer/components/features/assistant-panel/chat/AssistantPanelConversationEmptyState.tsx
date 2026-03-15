import { useEffect, useState } from 'react';
import { Loader2, Mic, Cast } from 'lucide-react';
import type { AssistantRuntimeState } from '../../../../state/assistantUiState';
import { Button, LivepairIcon } from '../../../primitives';

export type AssistantPanelConversationEmptyStateProps = {
  assistantState: AssistantRuntimeState;
  isLiveSessionActive: boolean;
  lastRuntimeError: string | null;
  onStartSpeechMode?: () => Promise<void>;
  onStartSpeechModeWithScreen?: () => Promise<void>;
};

export function AssistantPanelConversationEmptyState({
  assistantState,
  isLiveSessionActive,
  lastRuntimeError,
  onStartSpeechMode,
  onStartSpeechModeWithScreen,
}: AssistantPanelConversationEmptyStateProps): JSX.Element {
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    if (isLiveSessionActive) {
      setIsStarting(false);
    }
  }, [isLiveSessionActive]);

  const handleStart = (): void => {
    if (!onStartSpeechMode) return;
    setIsStarting(true);
    void onStartSpeechMode().catch(() => {
      setIsStarting(false);
    });
  };

  if (assistantState === 'error' && lastRuntimeError) {
    return (
      <div className="assistant-panel__conversation-card assistant-panel__conversation-card--empty">
        <p className="assistant-panel__conversation-empty-title">Live session unavailable</p>
        <p className="assistant-panel__conversation-empty-body">{lastRuntimeError}</p>
        <p className="assistant-panel__conversation-empty-body">
          Start Live Session again to reconnect. This container will keep the history visible here.
        </p>
      </div>
    );
  }

  return (
    <div
      className={[
        'assistant-panel__conversation-card',
        'assistant-panel__conversation-card--empty',
        isLiveSessionActive && 'assistant-panel__conversation-card--fading',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="assistant-panel__conversation-empty-identity">
        <LivepairIcon
          size={72}
          className="assistant-panel__conversation-empty-icon"
          aria-hidden="true"
        />
        <p className="assistant-panel__conversation-empty-title">Talk to Livepair</p>
      </div>
      {!isLiveSessionActive && (onStartSpeechMode || onStartSpeechModeWithScreen) ? (
        <div className="assistant-panel__inactive-cta-buttons">
          {onStartSpeechMode ? (
            <Button
              variant="primary"
              size="md"
              className={[
                'assistant-panel__inactive-cta-button',
                isStarting && 'assistant-panel__inactive-cta-button--loading',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={isStarting}
              onClick={handleStart}
            >
              {isStarting ? (
                <Loader2 size={18} aria-hidden="true" />
              ) : (
                <>
                  <Mic size={16} aria-hidden="true" />
                  Talk
                </>
              )}
            </Button>
          ) : null}
          {onStartSpeechModeWithScreen ? (
            <Button
              variant="secondary"
              size="md"
              className={[
                'assistant-panel__inactive-cta-button',
                isStarting && 'assistant-panel__inactive-cta-button--loading',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={isStarting}
              onClick={() => {
                if (!onStartSpeechModeWithScreen) return;
                setIsStarting(true);
                void onStartSpeechModeWithScreen().catch(() => {
                  setIsStarting(false);
                });
              }}
            >
              {isStarting ? (
                <Loader2 size={18} aria-hidden="true" />
              ) : (
                <>
                  <Cast size={16} aria-hidden="true" />
                  Share screen
                </>
              )}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
