import { History, MessageCircle } from 'lucide-react';
import type { AssistantRuntimeState } from '../../state/assistantUiState';

export type AssistantPanelConversationEmptyStateProps = {
  assistantState: AssistantRuntimeState;
  isLiveSessionActive: boolean;
  lastRuntimeError: string | null;
  liveSessionPhaseLabel?: string | null;
};

export function AssistantPanelConversationEmptyState({
  assistantState,
  isLiveSessionActive,
  lastRuntimeError,
  liveSessionPhaseLabel = null,
}: AssistantPanelConversationEmptyStateProps): JSX.Element {
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
    <div className="assistant-panel__conversation-card assistant-panel__conversation-card--empty">
      {isLiveSessionActive ? (
        <MessageCircle
          size={56}
          strokeWidth={1.25}
          className="assistant-panel__conversation-empty-icon"
          aria-hidden="true"
        />
      ) : (
        <History
          size={56}
          strokeWidth={1.25}
          className="assistant-panel__conversation-empty-icon"
          aria-hidden="true"
        />
      )}
      <p className="assistant-panel__conversation-empty-title" role="status" aria-live="polite">
        {isLiveSessionActive
          ? (liveSessionPhaseLabel ?? 'Start speaking')
          : 'Live session history starts here'}
      </p>
      <p className="assistant-panel__conversation-empty-body">
        {isLiveSessionActive
          ? 'Your spoken turns and assistant replies will appear here.'
          : 'When the session is inactive, this container stays available for history and context.'}
      </p>
      {!isLiveSessionActive ? (
        <p className="assistant-panel__conversation-empty-body">
          Start Live Session to begin adding turns.
        </p>
      ) : null}
    </div>
  );
}
