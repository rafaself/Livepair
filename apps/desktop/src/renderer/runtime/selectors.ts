import type { AssistantRuntimeState } from '../state/assistantUiState';
import type { SessionStoreState } from '../store/sessionStore';
import {
  getTextSessionStatus,
} from '../store/sessionStore';
import {
  createControlGatingSnapshot,
  getComposerSpeechActionKind,
  type ControlGatingSnapshot,
} from './controlGating';
import type {
  ConversationTimelineEntry,
  ConversationTurnModel,
  TranscriptArtifactModel,
} from './conversation/conversation.types';
import { isSessionActiveLifecycle, isTextTurnInFlight } from './text/textSessionLifecycle';
import { isSpeechLifecycleActive } from './speech/speechSessionLifecycle';

export type LiveRuntimeSessionSnapshot = {
  assistantState: AssistantRuntimeState;
  currentMode: SessionStoreState['currentMode'];
  activeTransport: SessionStoreState['activeTransport'];
  isSpeechMode: boolean;
  backendState: SessionStoreState['backendState'];
  backendIndicatorState: AssistantRuntimeState;
  backendLabel: string;
  tokenRequestState: SessionStoreState['tokenRequestState'];
  tokenFeedback: string | null;
  textSessionStatus: SessionStoreState['textSessionLifecycle']['status'];
  textSessionStatusLabel: string;
  canSubmitText: boolean;
  lastRuntimeError: string | null;
  isSessionActive: boolean;
  liveSessionPhaseLabel: string | null;
  speechLifecycleStatus: SessionStoreState['speechLifecycle']['status'];
  voiceSessionStatus: SessionStoreState['voiceSessionStatus'];
  voiceSessionResumptionStatus: SessionStoreState['voiceSessionResumption']['status'];
  voiceCaptureState: SessionStoreState['voiceCaptureState'];
  screenCaptureState: SessionStoreState['screenCaptureState'];
  isVoiceSessionActive: boolean;
  controlGatingSnapshot: ControlGatingSnapshot;
  composerSpeechActionKind: ReturnType<typeof getComposerSpeechActionKind>;
  localUserSpeechActive: SessionStoreState['localUserSpeechActive'];
};

export type LiveRuntimeConversationSnapshot = {
  conversationTurns: ConversationTimelineEntry[];
  isConversationEmpty: boolean;
};

export type LiveRuntimeDiagnosticsSnapshot = {
  backendState: SessionStoreState['backendState'];
  backendIndicatorState: AssistantRuntimeState;
  backendLabel: string;
  tokenFeedback: string | null;
  voiceSessionStatus: SessionStoreState['voiceSessionStatus'];
  activeVoiceSessionGroundingEnabled: SessionStoreState['activeVoiceSessionGroundingEnabled'];
  effectiveVoiceSessionCapabilities: SessionStoreState['effectiveVoiceSessionCapabilities'];
  voiceSessionLatency: SessionStoreState['voiceSessionLatency'];
  voiceSessionResumption: SessionStoreState['voiceSessionResumption'];
  voiceSessionDurability: SessionStoreState['voiceSessionDurability'];
  voiceTranscriptDiagnostics: SessionStoreState['voiceTranscriptDiagnostics'];
  ignoredAssistantOutputDiagnostics: SessionStoreState['ignoredAssistantOutputDiagnostics'];
  voiceSessionRecoveryDiagnostics: SessionStoreState['voiceSessionRecoveryDiagnostics'];
  voiceCaptureState: SessionStoreState['voiceCaptureState'];
  voiceCaptureDiagnostics: SessionStoreState['voiceCaptureDiagnostics'];
  voicePlaybackState: SessionStoreState['voicePlaybackState'];
  voicePlaybackDiagnostics: SessionStoreState['voicePlaybackDiagnostics'];
  voiceToolState: SessionStoreState['voiceToolState'];
  voiceLiveSignalDiagnostics: SessionStoreState['voiceLiveSignalDiagnostics'];
  realtimeOutboundDiagnostics: SessionStoreState['realtimeOutboundDiagnostics'];
  screenCaptureState: SessionStoreState['screenCaptureState'];
  screenCaptureDiagnostics: SessionStoreState['screenCaptureDiagnostics'];
  visualSendDiagnostics: SessionStoreState['visualSendDiagnostics'];
};

function getAttachedConversationTurn(
  artifact: TranscriptArtifactModel,
  conversationTurnsById: ReadonlyMap<string, ConversationTurnModel>,
): ConversationTurnModel | null {
  const attachedTurnId = artifact.attachedTurnId;

  if (attachedTurnId === undefined) {
    return null;
  }

  return conversationTurnsById.get(attachedTurnId) ?? null;
}

function transcriptArtifactCoversConversationTurn(
  artifact: TranscriptArtifactModel,
  conversationTurnsById: ReadonlyMap<string, ConversationTurnModel>,
): boolean {
  const attachedTurn = getAttachedConversationTurn(artifact, conversationTurnsById);

  return attachedTurn !== null && attachedTurn.content.trim() === artifact.content.trim();
}

function filterVisibleConversationTurns(
  conversationTurns: readonly ConversationTurnModel[],
  transcriptArtifacts: readonly TranscriptArtifactModel[],
): readonly ConversationTurnModel[] {
  const conversationTurnsById = new Map(conversationTurns.map((turn) => [turn.id, turn]));
  return conversationTurns.filter((turn) =>
    !transcriptArtifacts.some((artifact) =>
      artifact.attachedTurnId === turn.id
      && transcriptArtifactCoversConversationTurn(artifact, conversationTurnsById),
    ));
}

function hasDefinedIncreasingOrdinals(
  entries: readonly Pick<ConversationTimelineEntry, 'timelineOrdinal'>[],
): boolean {
  let previousOrdinal = 0;

  for (const entry of entries) {
    if (entry.timelineOrdinal === undefined || entry.timelineOrdinal < previousOrdinal) {
      return false;
    }

    previousOrdinal = entry.timelineOrdinal;
  }

  return true;
}

function mergeOrderedConversationTimeline(
  conversationTurns: readonly ConversationTurnModel[],
  transcriptArtifacts: readonly TranscriptArtifactModel[],
): ConversationTimelineEntry[] {
  const mergedTimeline: ConversationTimelineEntry[] = [];
  let turnIndex = 0;
  let artifactIndex = 0;

  while (turnIndex < conversationTurns.length && artifactIndex < transcriptArtifacts.length) {
    const nextTurn = conversationTurns[turnIndex]!;
    const nextArtifact = transcriptArtifacts[artifactIndex]!;
    const nextTurnOrdinal = nextTurn.timelineOrdinal ?? 0;
    const nextArtifactOrdinal = nextArtifact.timelineOrdinal ?? 0;

    if (nextTurnOrdinal < nextArtifactOrdinal) {
      mergedTimeline.push(nextTurn);
      turnIndex += 1;
      continue;
    }

    if (nextTurnOrdinal === nextArtifactOrdinal && nextArtifact.attachedTurnId !== nextTurn.id) {
      mergedTimeline.push(nextTurn);
      turnIndex += 1;
      continue;
    }

    mergedTimeline.push(nextArtifact);
    artifactIndex += 1;
  }

  if (turnIndex < conversationTurns.length) {
    mergedTimeline.push(...conversationTurns.slice(turnIndex));
  }

  if (artifactIndex < transcriptArtifacts.length) {
    mergedTimeline.push(...transcriptArtifacts.slice(artifactIndex));
  }

  return mergedTimeline;
}

export function selectAssistantRuntimeState(
  state: Pick<
    SessionStoreState,
    'assistantActivity' | 'backendState' | 'textSessionLifecycle' | 'tokenRequestState'
  >,
): AssistantRuntimeState {
  const textSessionStatus = getTextSessionStatus(state);

  if (
    state.backendState === 'failed' ||
    state.tokenRequestState === 'error' ||
    textSessionStatus === 'error' ||
    textSessionStatus === 'goAway'
  ) {
    return 'error';
  }

  if (state.assistantActivity === 'speaking') {
    return 'speaking';
  }

  if (state.assistantActivity === 'listening') {
    return 'listening';
  }

  if (
    textSessionStatus === 'connecting' ||
    textSessionStatus === 'sending' ||
    textSessionStatus === 'receiving' ||
    textSessionStatus === 'generationCompleted' ||
    textSessionStatus === 'interrupted' ||
    textSessionStatus === 'disconnecting'
  ) {
    return 'thinking';
  }

  if (textSessionStatus === 'ready' || textSessionStatus === 'completed') {
    return 'ready';
  }

  if (state.backendState === 'checking' || state.tokenRequestState === 'loading') {
    return 'thinking';
  }

  return 'disconnected';
}

export function selectBackendIndicatorState(
  state: Pick<SessionStoreState, 'backendState'>,
): AssistantRuntimeState {
  if (state.backendState === 'connected') {
    return 'ready';
  }

  if (state.backendState === 'checking') {
    return 'thinking';
  }

  if (state.backendState === 'failed') {
    return 'error';
  }

  return 'disconnected';
}

export function selectBackendLabel(
  state: Pick<SessionStoreState, 'backendState'>,
): string {
  if (state.backendState === 'connected') {
    return 'Connected';
  }

  if (state.backendState === 'checking') {
    return 'Checking backend...';
  }

  return 'Not connected';
}

export function selectTokenFeedback(
  state: Pick<SessionStoreState, 'tokenRequestState'>,
): string | null {
  if (state.tokenRequestState === 'loading') {
    return 'Requesting token...';
  }

  if (state.tokenRequestState === 'success') {
    return 'Token received';
  }

  if (state.tokenRequestState === 'error') {
    return 'Connection failed';
  }

  return null;
}

export function selectTextSessionStatus(
  state: Pick<SessionStoreState, 'textSessionLifecycle'>,
) {
  return getTextSessionStatus(state);
}

export function selectTextSessionStatusLabel(
  state: Pick<SessionStoreState, 'textSessionLifecycle'>,
): string {
  const textSessionStatus = getTextSessionStatus(state);

  if (textSessionStatus === 'connecting') {
    return 'Preparing typed input...';
  }

  if (textSessionStatus === 'ready') {
    return 'Typed input ready';
  }

  if (textSessionStatus === 'sending') {
    return 'Sending typed input...';
  }

  if (textSessionStatus === 'receiving') {
    return 'Receiving response...';
  }

  if (textSessionStatus === 'generationCompleted') {
    return 'Response generated, waiting for turn completion...';
  }

  if (textSessionStatus === 'completed') {
    return 'Response complete';
  }

  if (textSessionStatus === 'interrupted') {
    return 'Response interrupted';
  }

  if (textSessionStatus === 'goAway') {
    return 'Typed input unavailable. Send again to retry.';
  }

  if (textSessionStatus === 'disconnecting') {
    return 'Ending typed input...';
  }

  if (textSessionStatus === 'error') {
    return 'Typed input failed';
  }

  return 'Typed input unavailable';
}

export function selectCanSubmitText(
  state: Pick<SessionStoreState, 'textSessionLifecycle'>,
): boolean {
  return !isTextTurnInFlight(getTextSessionStatus(state));
}

export function selectIsConversationEmpty(
  state: Pick<SessionStoreState, 'conversationTurns' | 'transcriptArtifacts'>,
): boolean {
  return state.conversationTurns.length === 0 && state.transcriptArtifacts.length === 0;
}

export function selectVisibleConversationTimeline(
  state: Pick<SessionStoreState, 'conversationTurns' | 'transcriptArtifacts'>,
): ConversationTimelineEntry[] {
  const { transcriptArtifacts } = state;
  const visibleTurns = filterVisibleConversationTurns(state.conversationTurns, transcriptArtifacts);

  if (visibleTurns.length === 0) {
    return transcriptArtifacts.length > 0
      ? [...transcriptArtifacts]
      : [];
  }

  if (transcriptArtifacts.length === 0) {
    return [...visibleTurns];
  }

  if (
    hasDefinedIncreasingOrdinals(visibleTurns)
    && hasDefinedIncreasingOrdinals(transcriptArtifacts)
  ) {
    return mergeOrderedConversationTimeline(visibleTurns, transcriptArtifacts);
  }

  return [
    ...visibleTurns,
    ...transcriptArtifacts,
  ]
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const leftOrdinal = left.entry.timelineOrdinal;
      const rightOrdinal = right.entry.timelineOrdinal;

      if (leftOrdinal !== undefined && rightOrdinal !== undefined && leftOrdinal !== rightOrdinal) {
        return leftOrdinal - rightOrdinal;
      }

      if (leftOrdinal !== undefined && rightOrdinal === undefined) {
        return -1;
      }

      if (leftOrdinal === undefined && rightOrdinal !== undefined) {
        return 1;
      }

      if (
        left.entry.kind === 'transcript'
        && right.entry.kind !== 'transcript'
        && left.entry.attachedTurnId === right.entry.id
      ) {
        return -1;
      }

      if (
        right.entry.kind === 'transcript'
        && left.entry.kind !== 'transcript'
        && right.entry.attachedTurnId === left.entry.id
      ) {
        return 1;
      }

      return left.index - right.index;
    })
    .map(({ entry }) => entry);
}

export function selectIsSessionActive(
  state: Pick<SessionStoreState, 'textSessionLifecycle'>,
): boolean {
  return isSessionActiveLifecycle(getTextSessionStatus(state));
}

export function selectLiveSessionPhaseLabel(
  state: Pick<SessionStoreState, 'speechLifecycle' | 'voiceSessionResumption' | 'voiceSessionStatus'>,
): string | null {
  const speechStatus = state.speechLifecycle.status;

  if (speechStatus === 'starting') {
    return state.voiceSessionResumption.status === 'reconnecting'
      ? 'Resuming Live session...'
      : 'Starting Live session...';
  }

  if (speechStatus === 'ending') {
    return 'Ending Live session...';
  }

  if (isSpeechLifecycleActive(speechStatus) && state.voiceSessionStatus === 'recovering') {
    return 'Reconnecting...';
  }

  return null;
}

export function selectLiveRuntimeSessionSnapshot(
  state: Pick<
    SessionStoreState,
    | 'activeTransport'
    | 'assistantActivity'
    | 'backendState'
    | 'currentMode'
    | 'lastRuntimeError'
    | 'localUserSpeechActive'
    | 'screenCaptureState'
    | 'speechLifecycle'
    | 'textSessionLifecycle'
    | 'tokenRequestState'
    | 'voiceCaptureState'
    | 'voiceSessionResumption'
    | 'voiceSessionStatus'
  >,
): LiveRuntimeSessionSnapshot {
  const assistantState = selectAssistantRuntimeState(state);
  const backendIndicatorState = selectBackendIndicatorState(state);
  const backendLabel = selectBackendLabel(state);
  const tokenFeedback = selectTokenFeedback(state);
  const textSessionStatus = selectTextSessionStatus(state);
  const textSessionStatusLabel = selectTextSessionStatusLabel(state);
  const canSubmitText = selectCanSubmitText(state);
  const isSessionActive = selectIsSessionActive(state);
  const liveSessionPhaseLabel = selectLiveSessionPhaseLabel(state);
  const speechLifecycleStatus = state.speechLifecycle.status;
  const controlGatingSnapshot = createControlGatingSnapshot({
    currentMode: state.currentMode,
    speechLifecycleStatus,
    textSessionStatus,
    activeTransport: state.activeTransport,
    voiceSessionStatus: state.voiceSessionStatus,
    voiceCaptureState: state.voiceCaptureState,
    screenCaptureState: state.screenCaptureState,
  });

  return {
    assistantState,
    currentMode: state.currentMode,
    activeTransport: state.activeTransport,
    isSpeechMode: state.currentMode === 'speech',
    backendState: state.backendState,
    backendIndicatorState,
    backendLabel,
    tokenRequestState: state.tokenRequestState,
    tokenFeedback,
    textSessionStatus,
    textSessionStatusLabel,
    canSubmitText,
    lastRuntimeError: state.lastRuntimeError,
    isSessionActive,
    liveSessionPhaseLabel,
    speechLifecycleStatus,
    voiceSessionStatus: state.voiceSessionStatus,
    voiceSessionResumptionStatus: state.voiceSessionResumption.status,
    voiceCaptureState: state.voiceCaptureState,
    screenCaptureState: state.screenCaptureState,
    isVoiceSessionActive: isSpeechLifecycleActive(speechLifecycleStatus),
    controlGatingSnapshot,
    composerSpeechActionKind: getComposerSpeechActionKind(controlGatingSnapshot),
    localUserSpeechActive: state.localUserSpeechActive,
  };
}

export function selectLiveRuntimeConversationSnapshot(
  state: Pick<SessionStoreState, 'conversationTurns' | 'transcriptArtifacts'>,
): LiveRuntimeConversationSnapshot {
  const conversationTurns = selectVisibleConversationTimeline(state);

  return {
    conversationTurns,
    isConversationEmpty: conversationTurns.length === 0,
  };
}

export function selectLiveRuntimeDiagnosticsSnapshot(
  state: Pick<
    SessionStoreState,
    | 'activeVoiceSessionGroundingEnabled'
    | 'backendState'
    | 'effectiveVoiceSessionCapabilities'
    | 'ignoredAssistantOutputDiagnostics'
    | 'realtimeOutboundDiagnostics'
    | 'screenCaptureDiagnostics'
    | 'screenCaptureState'
    | 'tokenRequestState'
    | 'visualSendDiagnostics'
    | 'voiceCaptureDiagnostics'
    | 'voiceCaptureState'
    | 'voiceLiveSignalDiagnostics'
    | 'voicePlaybackDiagnostics'
    | 'voicePlaybackState'
    | 'voiceSessionDurability'
    | 'voiceSessionLatency'
    | 'voiceSessionRecoveryDiagnostics'
    | 'voiceSessionResumption'
    | 'voiceSessionStatus'
    | 'voiceToolState'
    | 'voiceTranscriptDiagnostics'
  >,
): LiveRuntimeDiagnosticsSnapshot {
  return {
    backendState: state.backendState,
    backendIndicatorState: selectBackendIndicatorState(state),
    backendLabel: selectBackendLabel(state),
    tokenFeedback: selectTokenFeedback(state),
    voiceSessionStatus: state.voiceSessionStatus,
    activeVoiceSessionGroundingEnabled: state.activeVoiceSessionGroundingEnabled,
    effectiveVoiceSessionCapabilities: state.effectiveVoiceSessionCapabilities,
    voiceSessionLatency: state.voiceSessionLatency,
    voiceSessionResumption: state.voiceSessionResumption,
    voiceSessionDurability: state.voiceSessionDurability,
    voiceTranscriptDiagnostics: state.voiceTranscriptDiagnostics,
    ignoredAssistantOutputDiagnostics: state.ignoredAssistantOutputDiagnostics,
    voiceSessionRecoveryDiagnostics: state.voiceSessionRecoveryDiagnostics,
    voiceCaptureState: state.voiceCaptureState,
    voiceCaptureDiagnostics: state.voiceCaptureDiagnostics,
    voicePlaybackState: state.voicePlaybackState,
    voicePlaybackDiagnostics: state.voicePlaybackDiagnostics,
    voiceToolState: state.voiceToolState,
    voiceLiveSignalDiagnostics: state.voiceLiveSignalDiagnostics,
    realtimeOutboundDiagnostics: state.realtimeOutboundDiagnostics,
    screenCaptureState: state.screenCaptureState,
    screenCaptureDiagnostics: state.screenCaptureDiagnostics,
    visualSendDiagnostics: state.visualSendDiagnostics,
  };
}
