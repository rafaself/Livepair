import type { ChangeEventHandler, FormEventHandler } from 'react';
import type { ChatRecord, LiveSessionRecord } from '@livepair/shared-types';
import type { AssistantRuntimeState } from '../../../../state/assistantUiState';
import {
  canSubmitComposerText,
  createControlGatingSnapshot,
  isSpeechLifecycleActive,
  selectLiveSessionPhaseLabel,
  type ConversationTimelineEntry,
  type ProductMode,
  type SpeechLifecycleStatus,
  type TextSessionStatus,
  type TransportKind,
  type VoiceSessionResumptionState,
  type VoiceSessionStatus,
} from '../../../../runtime';
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
  activeChat?: ChatRecord | null;
  latestLiveSession?: LiveSessionRecord | null;
  turns: ConversationTimelineEntry[];
  isConversationEmpty: boolean;
  lastRuntimeError: string | null;
  draftText: string;
  isSubmittingTextTurn: boolean;
  localUserSpeechActive?: boolean;
  onDraftTextChange: ChangeEventHandler<HTMLTextAreaElement>;
  onSubmitTextTurn: FormEventHandler<HTMLFormElement>;
  onStartSpeechMode: () => Promise<void>;
  onStartSpeechModeWithScreen: () => Promise<void>;
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
  activeChat = null,
  latestLiveSession = null,
  turns,
  isConversationEmpty,
  lastRuntimeError,
  draftText,
  isSubmittingTextTurn,
  localUserSpeechActive = false,
  onDraftTextChange,
  onSubmitTextTurn,
  onStartSpeechMode,
  onStartSpeechModeWithScreen,
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
    localUserSpeechActive,
  });
  const composerPlaceholder = 'Add a note to the session';
  const isViewingPastChat = !isLiveSessionActive && activeChat?.isCurrent === false;
  const activeChatTitle = activeChat?.title ?? 'Untitled chat';

  return (
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
            onStartSpeechMode={onStartSpeechMode}
            onStartSpeechModeWithScreen={onStartSpeechModeWithScreen}
          />
        }
        isConversationEmpty={isConversationEmpty}
        isViewingPastChat={isViewingPastChat}
        lastRuntimeError={lastRuntimeError}
        activeChatTitle={activeChatTitle}
        latestLiveSession={latestLiveSession}
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
  );
}
