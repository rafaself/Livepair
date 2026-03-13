import type { AssistantRuntimeState } from '../state/assistantUiState';
import type { SessionStoreState } from '../store/sessionStore';
import {
  getTextSessionStatus,
} from '../store/sessionStore';
import type { ConversationTimelineEntry } from './conversation/conversation.types';
import { isSessionActiveLifecycle, isTextTurnInFlight } from './text/textSessionLifecycle';
import { isSpeechLifecycleActive } from './speech/speechSessionLifecycle';

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
  return selectVisibleConversationTimeline(state).length === 0;
}

export function selectVisibleConversationTimeline(
  state: Pick<SessionStoreState, 'conversationTurns' | 'transcriptArtifacts'>,
): ConversationTimelineEntry[] {
  return [
    ...state.conversationTurns,
    ...(state.transcriptArtifacts ?? []).filter((artifact) => artifact.attachedTurnId === undefined),
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
