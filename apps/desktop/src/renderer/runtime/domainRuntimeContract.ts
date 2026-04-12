import { useCallback } from 'react';
import type { AssistantRuntimeState } from '../state/assistantUiState';
import {
  useLiveRuntimeConversationSnapshot,
  useLiveRuntimeSessionSnapshot,
  useSessionRuntime,
} from './useSessionRuntime';
import type {
  ConversationTimelineEntry,
  ProductMode,
  SpeechLifecycleStatus,
  TextSessionStatus,
} from './public';
import type { LiveRuntimeSessionSnapshot } from './selectors';
import type { BackendConnectionState, TokenRequestState } from '../store/sessionStore';

export type DomainRuntimeContextState = 'inactive' | 'active' | 'busy' | 'error';

export type DomainRuntimeSessionSnapshot = {
  assistantState: AssistantRuntimeState;
  backendState: BackendConnectionState;
  backendIndicatorState: AssistantRuntimeState;
  backendLabel: string;
  currentMode: ProductMode;
  tokenRequestState: TokenRequestState;
  tokenFeedback: string | null;
  textSessionStatus: TextSessionStatus;
  textSessionStatusLabel: string;
  canSubmitText: boolean;
  canSubmitComposerText: boolean;
  lastRuntimeError: string | null;
  isSessionActive: boolean;
  liveSessionPhaseLabel: string | null;
  speechLifecycleStatus: SpeechLifecycleStatus;
  sessionRecoveryStatus: LiveRuntimeSessionSnapshot['voiceSessionResumptionStatus'];
  canEndSpeechMode: boolean;
  sessionActionKind: LiveRuntimeSessionSnapshot['composerSpeechActionKind'];
  localUserSpeechActive: boolean;
  canToggleContextSharing: boolean;
  isContextSharingActive: boolean;
  contextState: DomainRuntimeContextState;
};

export type DomainRuntimeConversationSnapshot = {
  conversationTurns: ConversationTimelineEntry[];
  isConversationEmpty: boolean;
};

export type DomainRuntimeCommands = {
  checkBackendHealth: () => Promise<void>;
  startSpeechMode: () => Promise<boolean>;
  startSpeechModeWithContext: () => Promise<boolean>;
  submitTextTurn: (text: string) => Promise<boolean>;
  setInputEnabled: (enabled: boolean) => Promise<void>;
  setContextSharingEnabled: (enabled: boolean) => Promise<void>;
  sendContextNow: () => void;
  requestEndSpeechMode: () => Promise<boolean>;
  reportRuntimeError: (detail: string) => void;
  setAssistantState: ReturnType<typeof useSessionRuntime>['setAssistantState'];
};

function toDomainRuntimeContextState(
  snapshot: LiveRuntimeSessionSnapshot,
): DomainRuntimeContextState {
  if (!snapshot.canToggleScreenContext && !snapshot.isScreenCaptureActive) {
    return 'inactive';
  }

  if (snapshot.screenCaptureState === 'requestingPermission' || snapshot.screenCaptureState === 'stopping') {
    return 'busy';
  }

  if (snapshot.screenCaptureState === 'error') {
    return 'error';
  }

  if (snapshot.isScreenCaptureActive) {
    return 'active';
  }

  return 'inactive';
}

export function selectDomainRuntimeSessionSnapshot(
  snapshot: LiveRuntimeSessionSnapshot,
): DomainRuntimeSessionSnapshot {
  return {
    assistantState: snapshot.assistantState,
    backendState: snapshot.backendState,
    backendIndicatorState: snapshot.backendIndicatorState,
    backendLabel: snapshot.backendLabel,
    currentMode: snapshot.currentMode,
    tokenRequestState: snapshot.tokenRequestState,
    tokenFeedback: snapshot.tokenFeedback,
    textSessionStatus: snapshot.textSessionStatus,
    textSessionStatusLabel: snapshot.textSessionStatusLabel,
    canSubmitText: snapshot.canSubmitText,
    canSubmitComposerText: snapshot.canSubmitText && snapshot.currentMode === 'speech'
      && snapshot.canEndSpeechMode !== false
      && snapshot.speechLifecycleStatus !== 'starting'
      && snapshot.speechLifecycleStatus !== 'ending',
    lastRuntimeError: snapshot.lastRuntimeError,
    isSessionActive: snapshot.isSessionActive,
    liveSessionPhaseLabel: snapshot.liveSessionPhaseLabel,
    speechLifecycleStatus: snapshot.speechLifecycleStatus,
    sessionRecoveryStatus: snapshot.voiceSessionResumptionStatus,
    canEndSpeechMode: snapshot.canEndSpeechMode,
    sessionActionKind: snapshot.composerSpeechActionKind,
    localUserSpeechActive: snapshot.localUserSpeechActive,
    canToggleContextSharing: snapshot.canToggleScreenContext,
    isContextSharingActive: snapshot.isScreenCaptureActive,
    contextState: toDomainRuntimeContextState(snapshot),
  };
}

export function useDomainRuntimeSessionSnapshot(): DomainRuntimeSessionSnapshot {
  return selectDomainRuntimeSessionSnapshot(useLiveRuntimeSessionSnapshot());
}

export function useDomainRuntimeConversationSnapshot(): DomainRuntimeConversationSnapshot {
  return useLiveRuntimeConversationSnapshot();
}

export function useDomainRuntimeCommands(): DomainRuntimeCommands {
  const runtime = useSessionRuntime();

  const setContextSharingEnabled = useCallback(async (enabled: boolean): Promise<void> => {
    if (enabled) {
      await runtime.handleStartScreenCapture();
      return;
    }

    await runtime.handleStopScreenCapture();
  }, [runtime]);

  return {
    checkBackendHealth: runtime.handleCheckBackendHealth,
    startSpeechMode: runtime.handleStartSpeechMode,
    startSpeechModeWithContext: runtime.handleStartSpeechModeWithScreenShare,
    submitTextTurn: runtime.handleSubmitTextTurn,
    setInputEnabled: runtime.handleSetComposerMicrophoneEnabled,
    setContextSharingEnabled,
    sendContextNow: runtime.handleSendScreenNow,
    requestEndSpeechMode: runtime.handleRequestEndSpeechMode,
    reportRuntimeError: runtime.handleReportRuntimeError,
    setAssistantState: runtime.setAssistantState,
  };
}

export function useDomainRuntimeHost() {
  const snapshot = useDomainRuntimeSessionSnapshot();
  const commands = useDomainRuntimeCommands();

  return {
    snapshot,
    ...snapshot,
    ...commands,
  };
}
