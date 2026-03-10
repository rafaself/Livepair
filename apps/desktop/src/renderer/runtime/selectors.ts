import type { AssistantRuntimeState } from '../state/assistantUiState';
import type { SessionStoreState } from '../store/sessionStore';

export function selectAssistantRuntimeState(
  state: Pick<
    SessionStoreState,
    | 'assistantActivity'
    | 'backendState'
    | 'sessionPhase'
    | 'textSessionStatus'
    | 'tokenRequestState'
    | 'transportState'
  >,
): AssistantRuntimeState {
  if (
    state.sessionPhase === 'error' ||
    state.backendState === 'failed' ||
    state.tokenRequestState === 'error' ||
    state.transportState === 'error' ||
    state.textSessionStatus === 'error'
  ) {
    return 'error';
  }

  if (state.assistantActivity === 'speaking') {
    return 'speaking';
  }

  if (state.assistantActivity === 'thinking') {
    return 'thinking';
  }

  if (state.assistantActivity === 'listening') {
    return 'listening';
  }

  if (state.textSessionStatus === 'connecting') {
    return 'thinking';
  }

  if (
    state.textSessionStatus === 'sending' ||
    state.textSessionStatus === 'receiving'
  ) {
    return 'thinking';
  }

  if (
    state.textSessionStatus === 'ready' ||
    state.textSessionStatus === 'completed' ||
    state.transportState === 'connected' ||
    state.sessionPhase === 'active'
  ) {
    return 'ready';
  }

  if (
    state.sessionPhase === 'starting' ||
    state.backendState === 'checking' ||
    state.tokenRequestState === 'loading' ||
    state.transportState === 'connecting'
  ) {
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

export function selectTextSessionStatusLabel(
  state: Pick<SessionStoreState, 'textSessionStatus'>,
): string {
  if (state.textSessionStatus === 'connecting') {
    return 'Connecting to text session...';
  }

  if (state.textSessionStatus === 'ready') {
    return 'Text session ready';
  }

  if (state.textSessionStatus === 'sending') {
    return 'Sending message...';
  }

  if (state.textSessionStatus === 'receiving') {
    return 'Receiving response...';
  }

  if (state.textSessionStatus === 'completed') {
    return 'Response complete';
  }

  if (state.textSessionStatus === 'error') {
    return 'Text session failed';
  }

  return 'Text session disconnected';
}

export function selectCanSubmitText(
  state: Pick<SessionStoreState, 'textSessionStatus'>,
): boolean {
  return !(
    state.textSessionStatus === 'connecting' ||
    state.textSessionStatus === 'sending' ||
    state.textSessionStatus === 'receiving'
  );
}

export function selectIsConversationEmpty(
  state: Pick<SessionStoreState, 'conversationTurns'>,
): boolean {
  return state.conversationTurns.length === 0;
}

export function selectIsSessionActive(
  state: Pick<SessionStoreState, 'sessionPhase' | 'transportState'>,
): boolean {
  return (
    state.sessionPhase === 'starting' ||
    state.sessionPhase === 'active' ||
    state.sessionPhase === 'ending' ||
    state.transportState === 'connecting' ||
    state.transportState === 'connected' ||
    state.transportState === 'disconnecting'
  );
}
