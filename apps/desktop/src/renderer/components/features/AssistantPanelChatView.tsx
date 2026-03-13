import type { ChangeEventHandler, FormEventHandler } from 'react';
import type { AssistantRuntimeState } from '../../state/assistantUiState';
import type { ConversationTimelineEntry } from '../../runtime/conversation/conversation.types';
import type { ProductMode } from '../../runtime/core/session.types';
import {
  canSubmitComposerText,
  createControlGatingSnapshot,
} from '../../runtime/controlGating';
import { isSpeechLifecycleActive } from '../../runtime/speech/speechSessionLifecycle';
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
  turns: ConversationTimelineEntry[];
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
  const isSpeechMode = currentMode === 'speech';
  const isLiveSessionActive = isSpeechLifecycleActive(speechLifecycleStatus);
  const composerAction = createAssistantPanelComposerAction({
    controlGatingSnapshot,
    draftText,
    isComposerDisabled,
    speechLifecycleStatus,
  });
  const composerPlaceholder = isLiveSessionActive
    ? 'Ask Livepair'
    : 'Start a Live session to type';

  return (
    <div className="assistant-panel__view-section">
      <section
        className="assistant-panel__chat-container"
        aria-label="Conversation"
      >
        <AssistantPanelConversationSection
          emptyState={
            <AssistantPanelConversationEmptyState
              assistantState={assistantState}
              isSpeechMode={isSpeechMode}
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
          isComposerDisabled={isComposerDisabled}
          isPanelOpen={isPanelOpen ?? false}
          placeholder={composerPlaceholder}
          onDraftTextChange={onDraftTextChange}
          onEndSpeechMode={onEndSpeechMode}
          onStartSpeechMode={onStartSpeechMode}
          onSubmitTextTurn={onSubmitTextTurn}
        />
      </section>
    </div>
  );
}
