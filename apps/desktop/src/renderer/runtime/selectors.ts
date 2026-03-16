import type { AssistantRuntimeState } from '../state/assistantUiState';
import type { SessionStoreState } from '../store/sessionStore';
import {
  getTextSessionStatus,
} from '../store/sessionStore';
import type {
  ConversationTimelineEntry,
  ConversationTurnModel,
  TranscriptArtifactModel,
} from './conversation/conversation.types';
import { isSessionActiveLifecycle, isTextTurnInFlight } from './text/textSessionLifecycle';
import { isSpeechLifecycleActive } from './speech/speechSessionLifecycle';

function collectVisibleTranscriptArtifacts(
  transcriptArtifacts: readonly TranscriptArtifactModel[],
): readonly TranscriptArtifactModel[] {
  let visibleArtifacts: TranscriptArtifactModel[] | null = null;

  for (const [index, artifact] of transcriptArtifacts.entries()) {
    if (artifact.attachedTurnId !== undefined) {
      if (visibleArtifacts === null) {
        visibleArtifacts = transcriptArtifacts.slice(0, index);
      }

      continue;
    }

    if (visibleArtifacts !== null) {
      visibleArtifacts.push(artifact);
    }
  }

  return visibleArtifacts ?? transcriptArtifacts;
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

    if ((nextTurn.timelineOrdinal ?? 0) <= (nextArtifact.timelineOrdinal ?? 0)) {
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
  if (state.conversationTurns.length > 0) {
    return false;
  }

  return !state.transcriptArtifacts.some((artifact) => artifact.attachedTurnId === undefined);
}

export function selectVisibleConversationTimeline(
  state: Pick<SessionStoreState, 'conversationTurns' | 'transcriptArtifacts'>,
): ConversationTimelineEntry[] {
  const visibleTranscriptArtifacts = collectVisibleTranscriptArtifacts(state.transcriptArtifacts);

  if (state.conversationTurns.length === 0) {
    return visibleTranscriptArtifacts === state.transcriptArtifacts
      ? state.transcriptArtifacts
      : [...visibleTranscriptArtifacts];
  }

  if (visibleTranscriptArtifacts.length === 0) {
    return state.conversationTurns;
  }

  if (
    hasDefinedIncreasingOrdinals(state.conversationTurns)
    && hasDefinedIncreasingOrdinals(visibleTranscriptArtifacts)
  ) {
    return mergeOrderedConversationTimeline(state.conversationTurns, visibleTranscriptArtifacts);
  }

  return [
    ...state.conversationTurns,
    ...visibleTranscriptArtifacts,
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
