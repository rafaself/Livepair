import { MessageCircle } from 'lucide-react';
import type { AssistantRuntimeState } from '../../state/assistantUiState';

export type AssistantPanelConversationEmptyStateProps = {
  assistantState: AssistantRuntimeState;
  isSpeechMode: boolean;
  lastRuntimeError: string | null;
};

export function AssistantPanelConversationEmptyState({
  assistantState,
  isSpeechMode,
  lastRuntimeError,
}: AssistantPanelConversationEmptyStateProps): JSX.Element {
  if (assistantState === 'error' && lastRuntimeError) {
    return (
      <div className="assistant-panel__conversation-card assistant-panel__conversation-card--empty">
        <p className="assistant-panel__conversation-empty-title">Session failed</p>
        <p className="assistant-panel__conversation-empty-body">{lastRuntimeError}</p>
        <p className="assistant-panel__conversation-empty-body">
          Start the session again from the dock to reconnect.
        </p>
      </div>
    );
  }

  return (
    <div className="assistant-panel__conversation-card assistant-panel__conversation-card--empty">
      <MessageCircle
        size={56}
        strokeWidth={1.25}
        className="assistant-panel__conversation-empty-icon"
        aria-hidden="true"
      />
      <p className="assistant-panel__conversation-empty-title">
        {isSpeechMode ? 'Start speaking' : 'No conversation yet'}
      </p>
      <p className="assistant-panel__conversation-empty-body">
        {isSpeechMode
          ? 'Your spoken turns and assistant replies will appear here.'
          : 'Send a text prompt to start the realtime loop and keep the latest exchange visible.'}
      </p>
    </div>
  );
}
