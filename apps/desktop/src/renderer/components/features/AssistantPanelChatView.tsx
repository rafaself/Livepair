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
import type { VoiceSessionResumptionState, VoiceSessionStatus } from '../../runtime/voice/voice.types';
import { selectLiveSessionPhaseLabel } from '../../runtime/selectors';
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
  voiceSessionResumption?: VoiceSessionResumptionState | null;
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
  voiceSessionResumption = null,
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
  const isLiveSessionActive = isSpeechLifecycleActive(speechLifecycleStatus);
  const liveSessionPhaseLabel = selectLiveSessionPhaseLabel({
    speechLifecycle: { status: speechLifecycleStatus },
    voiceSessionResumption: voiceSessionResumption ?? { status: 'idle', latestHandle: null, resumable: false, lastDetail: null },
    voiceSessionStatus,
  });
  const composerAction = createAssistantPanelComposerAction({
    controlGatingSnapshot,
    draftText,
    isConversationEmpty,
    isComposerDisabled,
    speechLifecycleStatus,
  });
  const composerPlaceholder = 'Ask Livepair';

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
              liveSessionPhaseLabel={liveSessionPhaseLabel}
            />
          }
          isConversationEmpty={isConversationEmpty}
          lastRuntimeError={lastRuntimeError}
          turns={turns}
        />
        <AssistantPanelChatComposer
          composerAction={composerAction}
          draftText={draftText}
          isConversationEmpty={isConversationEmpty}
          isComposerDisabled={isComposerDisabled}
          isLiveSessionActive={isLiveSessionActive}
          isPanelOpen={isPanelOpen ?? false}
          liveSessionPhaseLabel={liveSessionPhaseLabel}
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
