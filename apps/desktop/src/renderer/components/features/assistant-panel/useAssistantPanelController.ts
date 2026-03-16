import type { ChangeEvent, FormEvent } from 'react';
import type { AssistantRuntimeState } from '../../../state/assistantUiState';
import {
  useSessionRuntime,
  type ConversationTimelineEntry,
  type ProductMode,
  type ScreenCaptureState,
  type SpeechLifecycleStatus,
  type TextSessionStatus,
  type TransportKind,
  type VoiceCaptureState,
  type VoiceSessionStatus,
} from '../../../runtime';
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
  handleStartSpeechModeWithScreen: () => Promise<void>;
  handleToggleComposerMicrophone: () => Promise<void>;
  handleToggleComposerScreenShare: () => Promise<void>;
  handleEndSpeechMode: () => Promise<void>;
};

export type UseAssistantPanelControllerOptions = {
  screenShareModeGate?: (action: () => Promise<void>) => Promise<void>;
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
    assistantState,
    backendState,
    backendIndicatorState,
    backendLabel,
    currentMode,
    activeTransport,
    speechLifecycleStatus,
    tokenRequestState,
    tokenFeedback,
    textSessionStatus,
    textSessionStatusLabel,
    voiceSessionStatus,
    voiceCaptureState,
    screenCaptureState,
    isVoiceSessionActive,
    canSubmitText,
    lastRuntimeError,
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
    currentMode,
    speechLifecycleStatus,
    textSessionStatus,
    activeTransport,
    voiceSessionStatus,
    voiceCaptureState,
    screenCaptureState,
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
          isVoiceSessionActive,
          voiceCaptureState,
          screenCaptureState,
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
          isVoiceSessionActive,
          voiceCaptureState,
          screenCaptureState,
          onStartVoiceSession,
          onStartVoiceCapture,
          onStopVoiceCapture,
          onStartScreenCapture,
          onStopScreenCapture,
          onEndSpeechMode,
        },
  );

  return {
    assistantState,
    isPanelOpen,
    panelView,
    conversationTurns,
    isConversationEmpty,
    isComposerMicrophoneEnabled,
    setPanelView,
    closePanel,
    backendState,
    backendIndicatorState,
    backendLabel,
    currentMode,
    activeTransport,
    speechLifecycleStatus,
    tokenRequestState,
    tokenFeedback,
    textSessionStatus,
    textSessionStatusLabel,
    voiceSessionStatus,
    voiceCaptureState,
    screenCaptureState,
    isVoiceSessionActive,
    canSubmitText,
    lastRuntimeError,
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
