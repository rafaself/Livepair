import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import type { AssistantRuntimeState } from '../../../state/assistantUiState';
import {
  canEndSpeechMode,
  canSubmitComposerText,
  createControlGatingSnapshot,
  getComposerSpeechActionKind,
  useSessionRuntime,
  type ConversationTimelineEntry,
  type ProductMode,
  type ScreenCaptureDiagnostics,
  type ScreenCaptureState,
  type SpeechLifecycleStatus,
  type TextSessionStatus,
  type TransportKind,
  type VoiceCaptureDiagnostics,
  type VoiceCaptureState,
  type VoicePlaybackDiagnostics,
  type VoicePlaybackState,
  type VoiceSessionDurabilityState,
  type VoiceSessionResumptionState,
  type VoiceSessionStatus,
  type VoiceToolState,
} from '../../../runtime';
import { useUiStore, type PanelView } from '../../../store/uiStore';
import { type BackendConnectionState, type TokenRequestState } from '../../../store/sessionStore';

export type AssistantPanelController = {
  assistantState: AssistantRuntimeState;
  isPanelOpen: boolean;
  panelView: PanelView;
  conversationTurns: ConversationTimelineEntry[];
  isConversationEmpty: boolean;
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
  voiceSessionResumption: VoiceSessionResumptionState;
  voiceSessionDurability: VoiceSessionDurabilityState;
  voiceCaptureState: VoiceCaptureState;
  voiceCaptureDiagnostics: VoiceCaptureDiagnostics;
  voicePlaybackState: VoicePlaybackState;
  voicePlaybackDiagnostics: VoicePlaybackDiagnostics;
  voiceToolState: VoiceToolState;
  screenCaptureState: ScreenCaptureState;
  screenCaptureDiagnostics: ScreenCaptureDiagnostics;
  isVoiceSessionActive: boolean;
  canSubmitText: boolean;
  lastRuntimeError: string | null;
  draftText: string;
  isSubmittingTextTurn: boolean;
  handleDraftTextChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmitTextTurn: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  handleCheckBackendHealth: () => Promise<void>;
  handleStartSpeechMode: () => Promise<void>;
  handleEndSpeechMode: () => Promise<void>;
};

export function useAssistantPanelController(): AssistantPanelController {
  const isPanelOpen = useUiStore((state) => state.isPanelOpen);
  const panelView = useUiStore((state) => state.panelView);
  const closePanel = useUiStore((state) => state.closePanel);
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
    voiceSessionResumption,
    voiceSessionDurability,
    voiceCaptureState,
    voiceCaptureDiagnostics,
    voicePlaybackState,
    voicePlaybackDiagnostics,
    voiceToolState,
    screenCaptureState,
    screenCaptureDiagnostics,
    isVoiceSessionActive,
    canSubmitText,
    conversationTurns,
    lastRuntimeError,
    isConversationEmpty,
    handleCheckBackendHealth,
    handleStartVoiceSession,
    handleEndSpeechMode,
    handleSubmitTextTurn,
  } = useSessionRuntime();
  const [draftText, setDraftText] = useState('');
  const [isSubmittingTextTurn, setIsSubmittingTextTurn] = useState(false);

  const handleCheckBackendHealthCallback = useCallback(async (): Promise<void> => {
    await handleCheckBackendHealth();
  }, [handleCheckBackendHealth]);

  useEffect(() => {
    if (!isPanelOpen) {
      return;
    }

    void handleCheckBackendHealthCallback();
  }, [handleCheckBackendHealthCallback, isPanelOpen]);

  const handleStartSpeechMode = useCallback(async (): Promise<void> => {
    await handleStartVoiceSession();
  }, [handleStartVoiceSession]);

  const handleDraftTextChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>): void => {
    setDraftText(event.currentTarget.value);
  }, []);

  const handleSubmitTextTurnCallback = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();

      const nextDraft = draftText.trim();
      const controlGatingSnapshot = createControlGatingSnapshot({
        currentMode,
        speechLifecycleStatus,
        textSessionStatus,
        activeTransport,
        voiceSessionStatus,
        voiceCaptureState,
        screenCaptureState,
      });

      if (
        !nextDraft ||
        isSubmittingTextTurn ||
        !canSubmitComposerText(controlGatingSnapshot)
      ) {
        return;
      }

      setIsSubmittingTextTurn(true);

      try {
        const didSend = await handleSubmitTextTurn(nextDraft);

        if (didSend) {
          setDraftText('');
        }
      } finally {
        setIsSubmittingTextTurn(false);
      }
    },
    [
      activeTransport,
      currentMode,
      draftText,
      handleSubmitTextTurn,
      isSubmittingTextTurn,
      screenCaptureState,
      speechLifecycleStatus,
      textSessionStatus,
      voiceCaptureState,
      voiceSessionStatus,
    ],
  );

  const controlGatingSnapshot = createControlGatingSnapshot({
    currentMode,
    speechLifecycleStatus,
    textSessionStatus,
    activeTransport,
    voiceSessionStatus,
    voiceCaptureState,
    screenCaptureState,
  });

  const composerSpeechActionKind = getComposerSpeechActionKind(controlGatingSnapshot);

  return {
    assistantState,
    isPanelOpen,
    panelView,
    conversationTurns,
    isConversationEmpty,
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
    voiceSessionResumption,
    voiceSessionDurability,
    voiceCaptureState,
    voiceCaptureDiagnostics,
    voicePlaybackState,
    voicePlaybackDiagnostics,
    voiceToolState,
    screenCaptureState,
    screenCaptureDiagnostics,
    isVoiceSessionActive,
    canSubmitText,
    lastRuntimeError,
    draftText,
    isSubmittingTextTurn,
    handleDraftTextChange,
    handleSubmitTextTurn: handleSubmitTextTurnCallback,
    handleCheckBackendHealth: handleCheckBackendHealthCallback,
    handleStartSpeechMode: async () => {
      if (composerSpeechActionKind !== 'start') {
        return;
      }

      await handleStartSpeechMode();
    },
    handleEndSpeechMode: async () => {
      if (!canEndSpeechMode(controlGatingSnapshot)) {
        return;
      }

      await handleEndSpeechMode();
    },
  };
}
