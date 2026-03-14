import { useEffect, useState } from 'react';
import { Loader2, MessageCircle, Mic } from 'lucide-react';
import type { AssistantRuntimeState } from '../../../../state/assistantUiState';
import { Button } from '../../../primitives';

export type AssistantPanelConversationEmptyStateProps = {
  assistantState: AssistantRuntimeState;
  isLiveSessionActive: boolean;
  lastRuntimeError: string | null;
  onStartSpeechMode?: () => Promise<void>;
};

export function AssistantPanelConversationEmptyState({
  assistantState,
  isLiveSessionActive,
  lastRuntimeError,
  onStartSpeechMode,
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
      <MessageCircle
        size={72}
        strokeWidth={1.25}
        className="assistant-panel__conversation-empty-icon"
        aria-hidden="true"
      />
      <p className="assistant-panel__conversation-empty-title">Talk to Livepair</p>
      {!isLiveSessionActive && onStartSpeechMode ? (
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
    </div>
  );
}
