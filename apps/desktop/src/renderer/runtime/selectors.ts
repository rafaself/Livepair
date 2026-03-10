import type { AssistantRuntimeState } from '../state/assistantUiState';
import type { SessionStoreState } from '../store/sessionStore';
import {
  getTextSessionStatus,
} from '../store/sessionStore';
import { isSessionActiveLifecycle, isTextTurnInFlight } from './textSessionLifecycle';

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
    return 'Preparing text chat...';
  }

  if (textSessionStatus === 'ready') {
    return 'Text chat ready';
  }

  if (textSessionStatus === 'sending') {
    return 'Sending message...';
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
    return 'Text chat unavailable. Send again to retry.';
  }

  if (textSessionStatus === 'disconnecting') {
    return 'Disconnecting text session...';
  }

  if (textSessionStatus === 'error') {
    return 'Text session failed';
  }

  return 'Text session disconnected';
}

export function selectCanSubmitText(
  state: Pick<SessionStoreState, 'textSessionLifecycle'>,
): boolean {
  return !isTextTurnInFlight(getTextSessionStatus(state));
}

export function selectIsConversationEmpty(
  state: Pick<SessionStoreState, 'conversationTurns'>,
): boolean {
  return state.conversationTurns.length === 0;
}

export function selectIsSessionActive(
  state: Pick<SessionStoreState, 'textSessionLifecycle'>,
): boolean {
  return isSessionActiveLifecycle(getTextSessionStatus(state));
}
