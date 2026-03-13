import type { ChangeEventHandler, FormEventHandler } from 'react';
import type { AssistantRuntimeState } from '../../state/assistantUiState';
import type { ConversationTurnModel } from '../../runtime/conversation/conversation.types';
import type { ProductMode } from '../../runtime/core/session.types';
import {
  canSubmitComposerText,
  createControlGatingSnapshot,
  shouldShowSpeechControls,
} from '../../runtime/controlGating';
import type { SpeechLifecycleStatus } from '../../runtime/speech/speech.types';
import type { TextSessionStatus } from '../../runtime/text/text.types';
import type { TransportKind } from '../../runtime/transport/transport.types';
import type { VoiceSessionStatus } from '../../runtime/voice/voice.types';
import { AssistantPanelChatComposer } from './AssistantPanelChatComposer';
import { createAssistantPanelComposerAction } from './assistantPanelComposerAction';
import { AssistantPanelConversationEmptyState } from './AssistantPanelConversationEmptyState';
import { AssistantPanelConversationSection } from './AssistantPanelConversationSection';
import './AssistantPanelChatView.css';

export type AssistantPanelChatViewProps = {
  assistantState: AssistantRuntimeState;
  currentMode: ProductMode;
  isPanelOpen?: boolean;
  speechLifecycleStatus: SpeechLifecycleStatus;
  textSessionStatus: TextSessionStatus;
  canSubmitText: boolean;
  activeTransport?: TransportKind | null;
  voiceSessionStatus?: VoiceSessionStatus;
  turns: ConversationTurnModel[];
  isConversationEmpty: boolean;
  lastRuntimeError: string | null;
  draftText: string;
  isSubmittingTextTurn: boolean;
  onDraftTextChange: ChangeEventHandler<HTMLTextAreaElement>;
  onSubmitTextTurn: FormEventHandler<HTMLFormElement>;
  onStartSpeechMode: () => Promise<void>;
  onEndSpeechMode: () => Promise<void>;
};

export function AssistantPanelChatView({
  assistantState,
  currentMode,
  isPanelOpen,
  speechLifecycleStatus,
  textSessionStatus,
  canSubmitText,
  activeTransport = null,
  voiceSessionStatus = 'disconnected',
  turns,
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
  const isLiveSessionActive = shouldShowSpeechControls(controlGatingSnapshot);
  const composerAction = createAssistantPanelComposerAction({
    controlGatingSnapshot,
    draftText,
    hasConversationHistory: !isConversationEmpty,
    isComposerDisabled,
    speechLifecycleStatus,
  });

  return (
    <div className="assistant-panel__view-section">
      <section
        className="assistant-panel__chat-container"
        aria-label="Live session history"
      >
        <AssistantPanelConversationSection
          emptyState={
            <AssistantPanelConversationEmptyState
              assistantState={assistantState}
              isLiveSessionActive={isLiveSessionActive}
              lastRuntimeError={lastRuntimeError}
            />
          }
          isConversationEmpty={isConversationEmpty}
          lastRuntimeError={lastRuntimeError}
          turns={turns}
        />
        <AssistantPanelChatComposer
          composerAction={composerAction}
          draftText={draftText}
          hasConversationHistory={!isConversationEmpty}
          isComposerDisabled={isComposerDisabled}
          isLiveSessionActive={isLiveSessionActive}
          isPanelOpen={isPanelOpen ?? false}
          onDraftTextChange={onDraftTextChange}
          onEndSpeechMode={onEndSpeechMode}
          onStartSpeechMode={onStartSpeechMode}
          onSubmitTextTurn={onSubmitTextTurn}
        />
      </section>
    </div>
  );
}
