import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { TextSessionStatus } from '../../runtime/text/text.types';
import { ConversationList } from './ConversationList';
import { AssistantPanelSpeechTranscript } from './AssistantPanelSpeechTranscript';
import type { CurrentVoiceTranscript } from '../../runtime/voice/voice.types';
import type { ConversationTurnModel } from '../../runtime/conversation/conversation.types';

export type AssistantPanelConversationSectionProps = {
  currentVoiceTranscript: CurrentVoiceTranscript;
  emptyState: ReactNode;
  isConversationEmpty: boolean;
  lastRuntimeError: string | null;
  showSpeechTranscript: boolean;
  textSessionStatus: TextSessionStatus;
  textSessionStatusLabel: string;
  turns: ConversationTurnModel[];
};

export function AssistantPanelConversationSection({
  currentVoiceTranscript,
  emptyState,
  isConversationEmpty,
  lastRuntimeError,
  showSpeechTranscript,
  textSessionStatus,
  textSessionStatusLabel,
  turns,
}: AssistantPanelConversationSectionProps): JSX.Element {
  return (
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
        {lastRuntimeError && !isConversationEmpty ? (
          <div className="assistant-panel__runtime-error" role="alert">
            <TriangleAlert size={16} aria-hidden="true" />
            <p>{lastRuntimeError}</p>
          </div>
        ) : null}
      </div>

      <AssistantPanelSpeechTranscript
        currentVoiceTranscript={currentVoiceTranscript}
        show={showSpeechTranscript}
      />

      <ConversationList
        turns={turns}
        emptyState={emptyState}
        className={isConversationEmpty ? undefined : 'assistant-panel__conversation-list'}
      />
    </div>
  );
}
