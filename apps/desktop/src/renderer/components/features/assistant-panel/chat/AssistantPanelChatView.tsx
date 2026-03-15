import type { ChangeEventHandler, FormEventHandler } from 'react';
import type { ChatRecord, LiveSessionRecord } from '@livepair/shared-types';
import type { AssistantRuntimeState } from '../../../../state/assistantUiState';
import type { SelectOptionItem } from '../../../primitives';
import {
  canToggleScreenContext,
  canSubmitComposerText,
  createControlGatingSnapshot,
  isSpeechLifecycleActive,
  type ConversationTimelineEntry,
  type ProductMode,
  type ScreenCaptureState,
  type SpeechLifecycleStatus,
  type TextSessionStatus,
  type TransportKind,
  type VoiceSessionStatus,
} from '../../../../runtime';
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
  currentMode: ProductMode;
  isPanelOpen?: boolean;
  speechLifecycleStatus: SpeechLifecycleStatus;
  textSessionStatus: TextSessionStatus;
  canSubmitText: boolean;
  activeTransport?: TransportKind | null;
  voiceSessionStatus?: VoiceSessionStatus;
  activeChat?: ChatRecord | null;
  latestLiveSession?: LiveSessionRecord | null;
  turns: ConversationTimelineEntry[];
  isConversationEmpty: boolean;
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
  onStartSpeechModeWithScreen: () => Promise<void>;
  onToggleComposerMicrophone?: () => Promise<void>;
  onToggleComposerScreenShare?: () => Promise<void>;
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
  activeChat = null,
  latestLiveSession = null,
  turns,
  isConversationEmpty,
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
    screenCaptureState === 'capturing' ||
    screenCaptureState === 'streaming';
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
  const isViewingPastChat = !isLiveSessionActive && activeChat?.isCurrent === false;

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
        isLiveSessionActive={isLiveSessionActive}
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
