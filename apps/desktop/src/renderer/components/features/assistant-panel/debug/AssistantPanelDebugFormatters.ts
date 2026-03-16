import type {
  RealtimeOutboundDiagnostics,
  ScreenCaptureDiagnostics,
  ScreenCaptureState,
  VisualSendDiagnostics,
  VoiceCaptureState,
  VoicePlaybackState,
  VoiceSessionLatencyMetric,
  VoiceSessionResumptionState,
  VoiceSessionStatus,
  VoiceToolState,
} from '../../../../runtime';
import type {
  IgnoredAssistantOutputDiagnostics,
  VoiceSessionRecoveryDiagnostics,
} from '../../../../store/sessionStore.types';

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

export function formatVoiceLatencyMetric(metric: VoiceSessionLatencyMetric): string {
  if (metric.status === 'available' && metric.valueMs != null) {
    return `${metric.valueMs} ms`;
  }

  if (metric.status === 'pending') {
    return metric.lastValueMs == null ? 'Pending' : `Pending (last: ${metric.lastValueMs} ms)`;
  }

  return metric.lastValueMs == null ? 'Unavailable' : `Unavailable (last: ${metric.lastValueMs} ms)`;
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
  reason: VisualSendDiagnostics['lastEvent'],
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

  if (reason === 'manualSendRequested') {
    return 'Manual send requested';
  }

  if (reason === 'manualFrameSent') {
    return 'Manual send completed';
  }

  if (reason === 'manualSendBlocked') {
    return 'Manual send blocked';
  }

  if (reason === 'continuousStarted') {
    return 'Continuous sending started';
  }

  if (reason === 'continuousStopped') {
    return 'Continuous sending stopped';
  }

  if (reason === 'burstActivated') {
    return 'Burst activated';
  }

  if (reason === 'continuousBaseFrameSent') {
    return 'Continuous base frame sent';
  }

  if (reason === 'continuousBurstFrameSent') {
    return 'Continuous burst frame sent';
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

export function formatDiagnosticToggle(state: boolean | null): string {
  if (state === null) {
    return 'Unknown';
  }

  return state ? 'Enabled' : 'Disabled';
}

export function formatCountWithLastAt(count: number, at: string | null): string {
  return `${count} (last: ${at ?? 'None'})`;
}

export function formatDiagnosticCode(code: string | null): string {
  if (code === null) {
    return 'None';
  }

  return code.replaceAll('-', ' ');
}

export function formatIgnoredOutputByEvent(
  diagnostics: IgnoredAssistantOutputDiagnostics,
): string {
  return `text ${diagnostics.countsByEventType.textDelta} / transcript ${diagnostics.countsByEventType.outputTranscript} / audio ${diagnostics.countsByEventType.audioChunk} / turn ${diagnostics.countsByEventType.turnComplete}`;
}

export function formatIgnoredOutputSummary(
  diagnostics: IgnoredAssistantOutputDiagnostics,
): string {
  if (
    diagnostics.lastIgnoredReason === null
    || diagnostics.lastIgnoredEventType === null
    || diagnostics.lastIgnoredVoiceSessionStatus === null
  ) {
    return 'None';
  }

  return `${formatDiagnosticCode(diagnostics.lastIgnoredReason)} / ${formatDiagnosticCode(diagnostics.lastIgnoredEventType)} / ${formatDiagnosticCode(diagnostics.lastIgnoredVoiceSessionStatus)}`;
}

export function formatRecoveryTransition(
  diagnostics: VoiceSessionRecoveryDiagnostics,
): string {
  if (diagnostics.lastTransition === null) {
    return 'None';
  }

  return diagnostics.lastTransitionAt
    ? `${formatDiagnosticCode(diagnostics.lastTransition)} @ ${diagnostics.lastTransitionAt}`
    : formatDiagnosticCode(diagnostics.lastTransition);
}

export function formatTurnResetSummary(
  diagnostics: VoiceSessionRecoveryDiagnostics,
): string {
  if (diagnostics.lastTurnResetReason === null) {
    return 'None';
  }

  return diagnostics.lastTurnResetAt
    ? `${formatDiagnosticCode(diagnostics.lastTurnResetReason)} @ ${diagnostics.lastTurnResetAt}`
    : formatDiagnosticCode(diagnostics.lastTurnResetReason);
}
