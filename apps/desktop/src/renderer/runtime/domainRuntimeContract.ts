import { useCallback } from 'react';
import {
  useLiveRuntimeDiagnosticsSnapshot,
  useLiveRuntimeConversationSnapshot,
  useLiveRuntimeSessionSnapshot,
  useSessionRuntime,
} from './useSessionRuntime';
import type {
  AssistantRuntimeState,
  ConversationTimelineEntry,
  ControlGatingSnapshot,
  ProductMode,
  ScreenCaptureState,
  SpeechLifecycleStatus,
  TextSessionStatus,
  VoiceCaptureState,
} from './public';
import type { LiveRuntimeSessionSnapshot } from './selectors';
import type { BackendConnectionState, TokenRequestState } from '../store/sessionStore';
import {
  refreshDomainRuntimeScreenCaptureSources,
  selectDomainRuntimeScreenCaptureSource,
  setDomainRuntimeSaveScreenFramesEnabled,
  useDomainRuntimeHostStateSnapshot,
} from './host/domainRuntimeHostState';

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
  controlGatingSnapshot: ControlGatingSnapshot;
  voiceCaptureState: VoiceCaptureState;
  screenCaptureState: ScreenCaptureState;
};

export type DomainRuntimeConversationSnapshot = {
  conversationTurns: ConversationTimelineEntry[];
  isConversationEmpty: boolean;
};

export type DomainRuntimeDiagnosticsSnapshot = ReturnType<
  typeof useLiveRuntimeDiagnosticsSnapshot
>;

export type DomainRuntimeHostStateSnapshot = ReturnType<
  typeof useDomainRuntimeHostStateSnapshot
>;

export type DomainRuntimeCommands = {
  checkBackendHealth: () => Promise<void>;
  startSpeechMode: () => Promise<boolean>;
  startSpeechModeWithContext: () => Promise<boolean>;
  startVoiceCapture: () => Promise<void>;
  stopVoiceCapture: () => Promise<void>;
  startScreenCapture: () => Promise<void>;
  stopScreenCapture: () => Promise<void>;
  submitTextTurn: (text: string) => Promise<boolean>;
  setInputEnabled: (enabled: boolean) => Promise<void>;
  setContextSharingEnabled: (enabled: boolean) => Promise<void>;
  sendContextNow: () => void;
  requestEndSpeechMode: () => Promise<boolean>;
  refreshScreenCaptureSources: () => Promise<boolean>;
  selectScreenCaptureSource: (sourceId: string | null) => Promise<boolean>;
  setSaveScreenFramesEnabled: (enabled: boolean) => void;
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
    controlGatingSnapshot: snapshot.controlGatingSnapshot,
    voiceCaptureState: snapshot.voiceCaptureState,
    screenCaptureState: snapshot.screenCaptureState,
  };
}

export function useDomainRuntimeSessionSnapshot(): DomainRuntimeSessionSnapshot {
  return selectDomainRuntimeSessionSnapshot(useLiveRuntimeSessionSnapshot());
}

export function useDomainRuntimeConversationSnapshot(): DomainRuntimeConversationSnapshot {
  return useLiveRuntimeConversationSnapshot();
}

export function useDomainRuntimeDiagnosticsSnapshot(): DomainRuntimeDiagnosticsSnapshot {
  return useLiveRuntimeDiagnosticsSnapshot();
}

export function useDomainRuntimeHostState(): DomainRuntimeHostStateSnapshot {
  return useDomainRuntimeHostStateSnapshot();
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
    startVoiceCapture: runtime.handleStartVoiceCapture,
    stopVoiceCapture: runtime.handleStopVoiceCapture,
    startScreenCapture: runtime.handleStartScreenCapture,
    stopScreenCapture: runtime.handleStopScreenCapture,
    submitTextTurn: runtime.handleSubmitTextTurn,
    setInputEnabled: runtime.handleSetComposerMicrophoneEnabled,
    setContextSharingEnabled,
    sendContextNow: runtime.handleSendScreenNow,
    requestEndSpeechMode: runtime.handleRequestEndSpeechMode,
    refreshScreenCaptureSources: refreshDomainRuntimeScreenCaptureSources,
    selectScreenCaptureSource: selectDomainRuntimeScreenCaptureSource,
    setSaveScreenFramesEnabled: setDomainRuntimeSaveScreenFramesEnabled,
    reportRuntimeError: runtime.handleReportRuntimeError,
    setAssistantState: runtime.setAssistantState,
  };
}

export function useDomainRuntimeHost() {
  const snapshot = useDomainRuntimeSessionSnapshot();
  const hostState = useDomainRuntimeHostState();
  const commands = useDomainRuntimeCommands();

  return {
    snapshot,
    hostState,
    ...snapshot,
    ...hostState,
    ...commands,
  };
}
