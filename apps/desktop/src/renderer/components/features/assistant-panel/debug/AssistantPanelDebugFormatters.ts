import type {
  RealtimeOutboundDiagnostics,
  ScreenCaptureDiagnostics,
  ScreenCaptureState,
  VisualSendDiagnostics,
  VoiceCaptureState,
  VoicePlaybackState,
  VoiceSessionResumptionState,
  VoiceSessionStatus,
  VoiceToolState,
} from '../../../../runtime';

export function formatCapitalizedState(state: string): string {
  return state.charAt(0).toUpperCase() + state.slice(1);
}

export function formatVoiceCaptureState(state: VoiceCaptureState): string {
  if (state === 'requestingPermission') {
    return 'Requesting permission';
  }

  return formatCapitalizedState(state);
}

export function formatVoiceSessionStatus(state: VoiceSessionStatus): string {
  return formatCapitalizedState(state);
}

export function formatVoiceSessionResumptionStatus(
  state: VoiceSessionResumptionState['status'],
): string {
  if (state === 'goAway') {
    return 'GoAway';
  }

  if (state === 'resumeFailed') {
    return 'Resume failed';
  }

  if (state === 'reconnecting') {
    return 'Reconnecting';
  }

  return formatCapitalizedState(state);
}

export function truncateHandle(handle: string | null): string {
  if (!handle) {
    return 'None';
  }

  if (handle.length <= 24) {
    return handle;
  }

  return `${handle.slice(0, 12)}...${handle.slice(-8)}`;
}

export function formatVoicePlaybackState(state: VoicePlaybackState): string {
  return formatCapitalizedState(state);
}

export function formatVoiceToolState(state: VoiceToolState['status']): string {
  if (state === 'toolCallPending') {
    return 'Tool call pending';
  }

  if (state === 'toolExecuting') {
    return 'Tool executing';
  }

  if (state === 'toolResponding') {
    return 'Tool responding';
  }

  if (state === 'toolError') {
    return 'Tool error';
  }

  return 'Idle';
}

export function formatScreenCaptureState(state: ScreenCaptureState): string {
  if (state === 'requestingPermission') {
    return 'Requesting permission';
  }

  return formatCapitalizedState(state);
}

export function formatOverlayMaskReason(
  reason: ScreenCaptureDiagnostics['maskReason'],
): string {
  if (reason === 'panel-open') {
    return 'Panel open';
  }

  if (reason === 'panel-closed-dock-only') {
    return 'Panel closed (dock only)';
  }

  if (reason === 'window-source') {
    return 'Window source';
  }

  if (reason === 'other-display') {
    return 'Other display';
  }

  if (reason === 'missing-overlay-display') {
    return 'Missing overlay display';
  }

  if (reason === 'no-rects') {
    return 'No rects';
  }

  return 'Hidden';
}

export function formatVisualTransitionReason(
  reason: VisualSendDiagnostics['lastTransitionReason'],
): string {
  if (reason === null) {
    return 'None';
  }

  if (reason === 'screenShareStarted') {
    return 'Screen share started';
  }

  if (reason === 'screenShareStopped') {
    return 'Screen share stopped';
  }

  if (reason === 'analyzeScreenNow') {
    return 'Analyze screen now';
  }

  if (reason === 'snapshotConsumed') {
    return 'Snapshot consumed';
  }

  if (reason === 'enableStreaming') {
    return 'Enable streaming';
  }

  if (reason === 'stopStreaming') {
    return 'Stop streaming';
  }

  return reason;
}

export function formatOutboundBreakerState(
  state: RealtimeOutboundDiagnostics['breakerState'],
): string {
  return state === 'open' ? 'Open' : 'Closed';
}

export function formatOutboundDecisionOutcome(
  outcome: RealtimeOutboundDiagnostics['lastDecision'],
): string {
  if (outcome === null) {
    return 'None';
  }

  return formatCapitalizedState(outcome);
}

export function formatOutboundDecisionReason(
  reason: RealtimeOutboundDiagnostics['lastReason'],
): string {
  if (reason === null) {
    return 'None';
  }

  if (reason === 'stale-sequence') {
    return 'Stale sequence';
  }

  if (reason === 'superseded-latest') {
    return 'Superseded latest';
  }

  if (reason === 'lane-saturated') {
    return 'Lane saturated';
  }

  return 'Breaker open';
}
