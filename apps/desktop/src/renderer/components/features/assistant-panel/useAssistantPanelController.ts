import type { ChangeEvent, FormEvent } from 'react';
import type { AssistantRuntimeState } from '../../../state/assistantUiState';
import {
  type ConversationTimelineEntry,
  type ProductMode,
  type SpeechLifecycleStatus,
  type TextSessionStatus,
} from '../../../runtime/liveRuntime';
import { useDomainRuntimeHost } from '../../../runtime/domainRuntimeContract';
import { useUiStore, type PanelView } from '../../../store/uiStore';
import { type BackendConnectionState, type TokenRequestState } from '../../../store/sessionStore';
import { useAssistantPanelBackendHealth } from './useAssistantPanelBackendHealth';
import { useAssistantPanelComposerMediaActions } from './useAssistantPanelComposerMediaActions';
import { useAssistantPanelConversationState } from './useAssistantPanelConversationState';
import { useAssistantPanelTextComposer } from './useAssistantPanelTextComposer';

export type AssistantPanelController = {
  assistantState: AssistantRuntimeState;
  isPanelOpen: boolean;
  panelView: PanelView;
  conversationTurns: ConversationTimelineEntry[];
  isConversationEmpty: boolean;
  isComposerMicrophoneEnabled: boolean;
  localUserSpeechActive: boolean;
  setPanelView: (view: PanelView) => void;
  closePanel: () => void;
  backendState: BackendConnectionState;
  backendIndicatorState: AssistantRuntimeState;
  backendLabel: string;
  currentMode: ProductMode;
  speechLifecycleStatus: SpeechLifecycleStatus;
  tokenRequestState: TokenRequestState;
  tokenFeedback: string | null;
  textSessionStatus: TextSessionStatus;
  textSessionStatusLabel: string;
  isVoiceSessionActive: boolean;
  canToggleScreenContext: boolean;
  isScreenCaptureActive: boolean;
  canEndSpeechMode: boolean;
  sessionActionKind: 'start' | 'end';
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
    checkBackendHealth: onCheckBackendHealth,
    startSpeechMode: onStartSpeechMode,
    startSpeechModeWithContext: onStartSpeechModeWithScreenShare,
    setInputEnabled: onSetComposerMicrophoneEnabled,
    setContextSharingEnabled,
    requestEndSpeechMode: onEndSpeechMode,
    submitTextTurn: onSubmitTextTurn,
  } = useDomainRuntimeHost();
  const { conversationTurns, isConversationEmpty } = useAssistantPanelConversationState();
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
    canSubmitComposerText: snapshot.canSubmitComposerText,
    onSubmitTextTurn,
  });
  const toggleContextSharing = async (): Promise<boolean> => {
    await setContextSharingEnabled(!snapshot.isContextSharingActive);
    return true;
  };
  const {
    handleStartSpeechMode,
    handleStartSpeechModeWithScreen,
    handleToggleComposerMicrophone,
    handleToggleComposerScreenShare,
    handleEndSpeechMode,
  } = useAssistantPanelComposerMediaActions(
    screenShareModeGate
      ? {
          composerSpeechActionKind: snapshot.sessionActionKind,
          canEndSpeechMode: snapshot.canEndSpeechMode,
          canToggleScreenContext: snapshot.canToggleContextSharing,
          getIsComposerMicrophoneEnabled: () => useUiStore.getState().isComposerMicrophoneEnabled,
          setComposerMicrophoneEnabled,
          screenShareModeGate,
          onStartSpeechMode,
          onStartSpeechModeWithScreenShare,
          onSetComposerMicrophoneEnabled,
          onToggleScreenCapture: toggleContextSharing,
          onEndSpeechMode,
        }
      : {
          composerSpeechActionKind: snapshot.sessionActionKind,
          canEndSpeechMode: snapshot.canEndSpeechMode,
          canToggleScreenContext: snapshot.canToggleContextSharing,
          getIsComposerMicrophoneEnabled: () => useUiStore.getState().isComposerMicrophoneEnabled,
          setComposerMicrophoneEnabled,
          onStartSpeechMode,
          onStartSpeechModeWithScreenShare,
          onSetComposerMicrophoneEnabled,
          onToggleScreenCapture: toggleContextSharing,
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
    setPanelView,
    closePanel,
    backendState: snapshot.backendState,
    backendIndicatorState: snapshot.backendIndicatorState,
    backendLabel: snapshot.backendLabel,
    currentMode: snapshot.currentMode,
    speechLifecycleStatus: snapshot.speechLifecycleStatus,
    tokenRequestState: snapshot.tokenRequestState,
    tokenFeedback: snapshot.tokenFeedback,
    textSessionStatus: snapshot.textSessionStatus,
    textSessionStatusLabel: snapshot.textSessionStatusLabel,
    isVoiceSessionActive: snapshot.isSessionActive,
    canToggleScreenContext: snapshot.canToggleContextSharing,
    isScreenCaptureActive: snapshot.isContextSharingActive,
    canEndSpeechMode: snapshot.canEndSpeechMode,
    sessionActionKind: snapshot.sessionActionKind,
    canSubmitText: snapshot.canSubmitComposerText,
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
