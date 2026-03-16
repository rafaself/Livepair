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
