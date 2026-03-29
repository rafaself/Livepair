import type { ChangeEvent, FormEvent } from 'react';
import type { AssistantRuntimeState } from '../../../state/assistantUiState';
import {
  type ControlGatingSnapshot,
  useSessionRuntime,
  type ConversationTimelineEntry,
  type ProductMode,
  type ScreenCaptureState,
  type SpeechLifecycleStatus,
  type TextSessionStatus,
  type TransportKind,
  type VoiceCaptureState,
  type VoiceSessionStatus,
} from '../../../runtime/liveRuntime';
import { useUiStore, type PanelView } from '../../../store/uiStore';
import { type BackendConnectionState, type TokenRequestState } from '../../../store/sessionStore';
import { useAssistantPanelBackendHealth } from './useAssistantPanelBackendHealth';
import { useAssistantPanelComposerMediaActions } from './useAssistantPanelComposerMediaActions';
import { useAssistantPanelConversationState } from './useAssistantPanelConversationState';
import { useAssistantPanelControlState } from './useAssistantPanelControlState';
import { useAssistantPanelTextComposer } from './useAssistantPanelTextComposer';

export type AssistantPanelController = {
  assistantState: AssistantRuntimeState;
  isPanelOpen: boolean;
  panelView: PanelView;
  conversationTurns: ConversationTimelineEntry[];
  isConversationEmpty: boolean;
  isComposerMicrophoneEnabled: boolean;
  localUserSpeechActive: boolean;
  controlGatingSnapshot: ControlGatingSnapshot;
  setPanelView: (view: PanelView) => void;
  closePanel: () => void;
  backendState: BackendConnectionState;
  backendIndicatorState: AssistantRuntimeState;
  backendLabel: string;
  currentMode: ProductMode;
  activeTransport: TransportKind | null;
  speechLifecycleStatus: SpeechLifecycleStatus;
  tokenRequestState: TokenRequestState;
  tokenFeedback: string | null;
  textSessionStatus: TextSessionStatus;
  textSessionStatusLabel: string;
  voiceSessionStatus: VoiceSessionStatus;
  voiceCaptureState: VoiceCaptureState;
  screenCaptureState: ScreenCaptureState;
  isVoiceSessionActive: boolean;
  canSubmitText: boolean;
  lastRuntimeError: string | null;
  draftText: string;
  isSubmittingTextTurn: boolean;
  handleDraftTextChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmitTextTurn: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  handleCheckBackendHealth: () => Promise<void>;
  handleStartSpeechMode: () => Promise<void>;
  handleStartSpeechModeWithScreen: () => Promise<boolean | void>;
  handleToggleComposerMicrophone: () => Promise<void>;
  handleToggleComposerScreenShare: () => Promise<void>;
  handleEndSpeechMode: () => Promise<void>;
};

export type UseAssistantPanelControllerOptions = {
  screenShareModeGate?: (action: () => Promise<void>) => Promise<boolean | void>;
};

export function useAssistantPanelController({
  screenShareModeGate,
}: UseAssistantPanelControllerOptions = {}): AssistantPanelController {
  const isPanelOpen = useUiStore((state) => state.isPanelOpen);
  const panelView = useUiStore((state) => state.panelView);
  const isComposerMicrophoneEnabled = useUiStore((state) => state.isComposerMicrophoneEnabled);
  const closePanel = useUiStore((state) => state.closePanel);
  const setComposerMicrophoneEnabled = useUiStore((state) => state.setComposerMicrophoneEnabled);
  const setPanelView = useUiStore((state) => state.setPanelView);
  const {
    snapshot,
    handleCheckBackendHealth: onCheckBackendHealth,
    handleStartVoiceSession: onStartVoiceSession,
    handleStartVoiceCapture: onStartVoiceCapture,
    handleStopVoiceCapture: onStopVoiceCapture,
    handleStartScreenCapture: onStartScreenCapture,
    handleStopScreenCapture: onStopScreenCapture,
    handleEndSpeechMode: onEndSpeechMode,
    handleSubmitTextTurn: onSubmitTextTurn,
  } = useSessionRuntime();
  const { conversationTurns, isConversationEmpty } = useAssistantPanelConversationState();
  const { controlGatingSnapshot, composerSpeechActionKind } = useAssistantPanelControlState({
    sessionSnapshot: snapshot,
  });
  const handleCheckBackendHealth = useAssistantPanelBackendHealth({
    isPanelOpen,
    onCheckBackendHealth,
  });
  const {
    draftText,
    isSubmittingTextTurn,
    handleDraftTextChange,
    handleSubmitTextTurn,
  } = useAssistantPanelTextComposer({
    controlGatingSnapshot,
    onSubmitTextTurn,
  });
  const {
    handleStartSpeechMode,
    handleStartSpeechModeWithScreen,
    handleToggleComposerMicrophone,
    handleToggleComposerScreenShare,
    handleEndSpeechMode,
  } = useAssistantPanelComposerMediaActions(
    screenShareModeGate
      ? {
          controlGatingSnapshot,
          composerSpeechActionKind,
          getIsComposerMicrophoneEnabled: () => useUiStore.getState().isComposerMicrophoneEnabled,
          setComposerMicrophoneEnabled,
          screenShareModeGate,
          isVoiceSessionActive: snapshot.isVoiceSessionActive,
          voiceCaptureState: snapshot.voiceCaptureState,
          screenCaptureState: snapshot.screenCaptureState,
          onStartVoiceSession,
          onStartVoiceCapture,
          onStopVoiceCapture,
          onStartScreenCapture,
          onStopScreenCapture,
          onEndSpeechMode,
        }
      : {
          controlGatingSnapshot,
          composerSpeechActionKind,
          getIsComposerMicrophoneEnabled: () => useUiStore.getState().isComposerMicrophoneEnabled,
          setComposerMicrophoneEnabled,
          isVoiceSessionActive: snapshot.isVoiceSessionActive,
          voiceCaptureState: snapshot.voiceCaptureState,
          screenCaptureState: snapshot.screenCaptureState,
          onStartVoiceSession,
          onStartVoiceCapture,
          onStopVoiceCapture,
          onStartScreenCapture,
          onStopScreenCapture,
          onEndSpeechMode,
        },
  );

  return {
    assistantState: snapshot.assistantState,
    isPanelOpen,
    panelView,
    conversationTurns,
    isConversationEmpty,
    isComposerMicrophoneEnabled,
    localUserSpeechActive: snapshot.localUserSpeechActive,
    controlGatingSnapshot,
    setPanelView,
    closePanel,
    backendState: snapshot.backendState,
    backendIndicatorState: snapshot.backendIndicatorState,
    backendLabel: snapshot.backendLabel,
    currentMode: snapshot.currentMode,
    activeTransport: snapshot.activeTransport,
    speechLifecycleStatus: snapshot.speechLifecycleStatus,
    tokenRequestState: snapshot.tokenRequestState,
    tokenFeedback: snapshot.tokenFeedback,
    textSessionStatus: snapshot.textSessionStatus,
    textSessionStatusLabel: snapshot.textSessionStatusLabel,
    voiceSessionStatus: snapshot.voiceSessionStatus,
    voiceCaptureState: snapshot.voiceCaptureState,
    screenCaptureState: snapshot.screenCaptureState,
    isVoiceSessionActive: snapshot.isVoiceSessionActive,
    canSubmitText: snapshot.canSubmitText,
    lastRuntimeError: snapshot.lastRuntimeError,
    draftText,
    isSubmittingTextTurn,
    handleDraftTextChange,
    handleSubmitTextTurn,
    handleCheckBackendHealth,
    handleStartSpeechMode,
    handleStartSpeechModeWithScreen,
    handleToggleComposerMicrophone,
    handleToggleComposerScreenShare,
    handleEndSpeechMode,
  };
}
