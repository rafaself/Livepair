import type { ChangeEventHandler, FormEventHandler } from 'react';
import type { AssistantRuntimeState } from '../../state/assistantUiState';
import type { ConversationTurnModel } from '../../runtime/conversation/conversation.types';
import type { CurrentVoiceTranscript } from '../../runtime/voice/voice.types';
import type { ProductMode } from '../../runtime/core/session.types';
import {
  canSubmitComposerText,
  createControlGatingSnapshot,
} from '../../runtime/controlGating';
import type { SpeechLifecycleStatus } from '../../runtime/speech/speech.types';
import type { TextSessionStatus } from '../../runtime/text/text.types';
import type { TransportKind } from '../../runtime/transport/transport.types';
import type { VoiceSessionStatus } from '../../runtime/voice/voice.types';
import { AssistantPanelStateHero } from './AssistantPanelStateHero';
import { AssistantPanelChatComposer } from './AssistantPanelChatComposer';
import { createAssistantPanelComposerAction } from './assistantPanelComposerAction';
import { AssistantPanelConversationEmptyState } from './AssistantPanelConversationEmptyState';
import { AssistantPanelConversationSection } from './AssistantPanelConversationSection';
import './AssistantPanelChatView.css';

export type AssistantPanelChatViewProps = {
  assistantState: AssistantRuntimeState;
  currentMode: ProductMode;
  speechLifecycleStatus: SpeechLifecycleStatus;
  textSessionStatus: TextSessionStatus;
  textSessionStatusLabel: string;
  canSubmitText: boolean;
  activeTransport?: TransportKind | null;
  voiceSessionStatus?: VoiceSessionStatus;
  turns: ConversationTurnModel[];
  currentVoiceTranscript: CurrentVoiceTranscript;
  isConversationEmpty: boolean;
  lastRuntimeError: string | null;
  draftText: string;
  isSubmittingTextTurn: boolean;
  onDraftTextChange: ChangeEventHandler<HTMLInputElement>;
  onSubmitTextTurn: FormEventHandler<HTMLFormElement>;
  onStartSpeechMode: () => Promise<void>;
  onEndSpeechMode: () => Promise<void>;
};

export function AssistantPanelChatView({
  assistantState,
  currentMode,
  speechLifecycleStatus,
  textSessionStatus,
  textSessionStatusLabel,
  canSubmitText,
  activeTransport = null,
  voiceSessionStatus = 'disconnected',
  turns,
  currentVoiceTranscript,
  isConversationEmpty,
  lastRuntimeError,
  draftText,
  isSubmittingTextTurn,
  onDraftTextChange,
  onSubmitTextTurn,
  onStartSpeechMode,
  onEndSpeechMode,
}: AssistantPanelChatViewProps): JSX.Element {
  const controlGatingSnapshot = createControlGatingSnapshot({
    currentMode,
    speechLifecycleStatus,
    textSessionStatus,
    activeTransport,
    voiceSessionStatus,
  });
  const isComposerDisabled =
    isSubmittingTextTurn ||
    !canSubmitText ||
    !canSubmitComposerText(controlGatingSnapshot);
  const isSpeechMode = currentMode === 'speech';
  const hasVoiceTranscript =
    currentVoiceTranscript.user.text.trim().length > 0 ||
    currentVoiceTranscript.assistant.text.trim().length > 0;
  const composerAction = createAssistantPanelComposerAction({
    controlGatingSnapshot,
    draftText,
    isComposerDisabled,
    speechLifecycleStatus,
  });

  return (
    <div className="assistant-panel__view-section">
      <AssistantPanelStateHero state={assistantState} />
      <section
        className="assistant-panel__chat-container"
        aria-label="Conversation"
      >
        <AssistantPanelConversationSection
          currentVoiceTranscript={currentVoiceTranscript}
          emptyState={
            <AssistantPanelConversationEmptyState
              assistantState={assistantState}
              isSpeechMode={isSpeechMode}
              lastRuntimeError={lastRuntimeError}
            />
          }
          isConversationEmpty={isConversationEmpty}
          lastRuntimeError={lastRuntimeError}
          showSpeechTranscript={isSpeechMode || hasVoiceTranscript}
          textSessionStatus={textSessionStatus}
          textSessionStatusLabel={textSessionStatusLabel}
          turns={turns}
        />
        <AssistantPanelChatComposer
          composerAction={composerAction}
          draftText={draftText}
          isComposerDisabled={isComposerDisabled}
          onDraftTextChange={onDraftTextChange}
          onEndSpeechMode={onEndSpeechMode}
          onStartSpeechMode={onStartSpeechMode}
          onSubmitTextTurn={onSubmitTextTurn}
        />
      </section>
    </div>
  );
}
