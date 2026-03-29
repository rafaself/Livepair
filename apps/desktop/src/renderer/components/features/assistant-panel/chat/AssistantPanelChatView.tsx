import type { ChangeEventHandler, FormEventHandler } from 'react';
import type { ChatRecord, LiveSessionRecord } from '@livepair/shared-types';
import type { AssistantRuntimeState } from '../../../../state/assistantUiState';
import type { SelectOptionItem } from '../../../primitives';
import {
  canToggleScreenContext,
  canSubmitComposerText,
  type ControlGatingSnapshot,
  type ConversationTimelineEntry,
  type ScreenCaptureState,
  type SpeechLifecycleStatus,
} from '../../../../runtime/liveRuntime';
import { AssistantPanelChatComposer } from './AssistantPanelChatComposer';
import { createAssistantPanelComposerAction } from './assistantPanelComposerAction';
import { AssistantPanelConversationEmptyState } from './AssistantPanelConversationEmptyState';
import { AssistantPanelConversationSection } from './AssistantPanelConversationSection';
import './AssistantPanelChatLayout.css';
import './AssistantPanelChatHistory.css';
import './AssistantPanelChatComposer.css';
import './AssistantPanelChatEmptyState.css';

export type AssistantPanelChatViewProps = {
  assistantState: AssistantRuntimeState;
  isPanelOpen?: boolean;
  controlGatingSnapshot: ControlGatingSnapshot;
  speechLifecycleStatus: SpeechLifecycleStatus;
  canSubmitText: boolean;
  activeChat?: ChatRecord | null;
  latestLiveSession?: LiveSessionRecord | null;
  turns: ConversationTimelineEntry[];
  isConversationEmpty: boolean;
  isVoiceSessionActive: boolean;
  lastRuntimeError: string | null;
  draftText: string;
  isSubmittingTextTurn: boolean;
  isComposerMicrophoneEnabled?: boolean;
  inputDeviceOptions?: readonly SelectOptionItem[];
  localUserSpeechActive?: boolean;
  screenCaptureState?: ScreenCaptureState;
  screenCaptureSourceOptions?: readonly SelectOptionItem[];
  selectedInputDeviceId?: string;
  selectedScreenCaptureSourceId?: string;
  onDraftTextChange: ChangeEventHandler<HTMLTextAreaElement>;
  onSubmitTextTurn: FormEventHandler<HTMLFormElement>;
  onSelectComposerInputDevice?: (deviceId: string) => void;
  onSelectComposerScreenSource?: (sourceId: string) => void;
  onStartSpeechMode: () => Promise<void>;
  onStartSpeechModeWithScreen: () => Promise<boolean | void>;
  onToggleComposerMicrophone?: () => Promise<void>;
  onToggleComposerScreenShare?: () => Promise<void>;
  onEndSpeechMode: () => Promise<void>;
};

export function AssistantPanelChatView({
  assistantState,
  isPanelOpen,
  controlGatingSnapshot,
  speechLifecycleStatus,
  canSubmitText,
  activeChat = null,
  latestLiveSession = null,
  turns,
  isConversationEmpty,
  isVoiceSessionActive,
  lastRuntimeError,
  draftText,
  isSubmittingTextTurn,
  isComposerMicrophoneEnabled = true,
  inputDeviceOptions = [],
  localUserSpeechActive = false,
  screenCaptureState = 'disabled',
  screenCaptureSourceOptions = [],
  selectedInputDeviceId = '',
  selectedScreenCaptureSourceId = '',
  onDraftTextChange,
  onSubmitTextTurn,
  onSelectComposerInputDevice = () => undefined,
  onSelectComposerScreenSource = () => undefined,
  onStartSpeechMode,
  onStartSpeechModeWithScreen,
  onToggleComposerMicrophone = async () => undefined,
  onToggleComposerScreenShare = async () => undefined,
  onEndSpeechMode,
}: AssistantPanelChatViewProps): JSX.Element {
  const isComposerDisabled =
    isSubmittingTextTurn ||
    !canSubmitText ||
    !canSubmitComposerText(controlGatingSnapshot);
  const composerAction = createAssistantPanelComposerAction({
    controlGatingSnapshot,
    draftText,
    isConversationEmpty,
    isComposerDisabled,
    speechLifecycleStatus,
    localUserSpeechActive,
  });
  const isComposerScreenShareActive =
    screenCaptureState === 'ready' ||
    screenCaptureState === 'capturing';
  const isComposerScreenShareDisabled =
    composerAction.kind === 'startSpeech'
      ? composerAction.disabled || composerAction.isLoading
      : !canToggleScreenContext(controlGatingSnapshot);
  const screenShareButtonLabel =
    composerAction.kind === 'startSpeech'
      ? 'Start Live session with screen share'
      : isComposerScreenShareActive
        ? 'Stop screen share'
        : 'Start screen share';
  const composerPlaceholder = 'Add a note to the session';
  const isViewingPastChat = !isVoiceSessionActive && activeChat?.isCurrent === false;

  return (
    <section
      className="assistant-panel__chat-container"
      aria-label="Live session history"
    >
      <AssistantPanelConversationSection
        activeChatTitle={activeChat?.title ?? null}
        emptyState={
          <AssistantPanelConversationEmptyState
            assistantState={assistantState}
            isLiveSessionActive={isVoiceSessionActive}
            lastRuntimeError={lastRuntimeError}
            onStartSpeechMode={onStartSpeechMode}
            onStartSpeechModeWithScreen={onStartSpeechModeWithScreen}
          />
        }
        isConversationEmpty={isConversationEmpty}
        isViewingPastChat={isViewingPastChat}
        lastRuntimeError={lastRuntimeError}
        latestLiveSession={latestLiveSession}
        turns={turns}
      />
      <AssistantPanelChatComposer
        composerAction={composerAction}
        draftText={draftText}
        isConversationEmpty={isConversationEmpty}
        isComposerDisabled={isComposerDisabled}
        isComposerMicrophoneEnabled={isComposerMicrophoneEnabled}
        isComposerScreenShareActive={isComposerScreenShareActive}
        isComposerScreenShareDisabled={isComposerScreenShareDisabled}
        isLiveSessionActive={isVoiceSessionActive}
        isPanelOpen={isPanelOpen ?? false}
        inputDeviceOptions={inputDeviceOptions}
        placeholder={composerPlaceholder}
        screenCaptureSourceOptions={screenCaptureSourceOptions}
        selectedInputDeviceId={selectedInputDeviceId}
        selectedScreenCaptureSourceId={selectedScreenCaptureSourceId}
        screenShareButtonLabel={screenShareButtonLabel}
        onDraftTextChange={onDraftTextChange}
        onEndSpeechMode={onEndSpeechMode}
        onSelectComposerInputDevice={onSelectComposerInputDevice}
        onSelectComposerScreenSource={onSelectComposerScreenSource}
        onStartSpeechMode={onStartSpeechMode}
        onToggleComposerMicrophone={onToggleComposerMicrophone}
        onToggleComposerScreenShare={onToggleComposerScreenShare}
        onSubmitTextTurn={onSubmitTextTurn}
      />
    </section>
  );
}
