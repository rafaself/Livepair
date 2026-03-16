import { LIVE_ADAPTER_KEY } from './liveConfig';
import { shouldIgnoreTermination } from './transportEventGating';
import { invalidateVoiceSessionLatency } from '../session/voiceSessionLatencyState';
import { isTokenValidForReconnect } from '../voice/session/voiceSessionToken';
import type { LiveSessionEvent } from './transport.types';
import type { TransportEventRouterContext } from './transportEventRouterTypes';

const DEFAULT_UNAVAILABLE_DETAIL = 'Voice session unavailable';
const GROUNDING_SESSION_RESTART_DETAIL =
  'Grounding setting changed; start a new session to apply it.';

function getUnavailableDetail(detail?: string): string {
  return detail ?? DEFAULT_UNAVAILABLE_DETAIL;
}

function logResumeRequest(context: TransportEventRouterContext, detail: string, message: string): void {
  const { ops, store } = context;
  const voiceStatus = ops.currentVoiceSessionStatus();

  ops.logRuntimeDiagnostic('voice-session', message, {
    detail,
    voiceStatus,
    latestHandle: store.voiceSessionResumption.latestHandle,
    resumable: store.voiceSessionResumption.resumable,
    tokenValid: isTokenValidForReconnect(ops.getToken()),
  });
}

function handleConnectionStateChanged(
  context: TransportEventRouterContext,
  event: Extract<LiveSessionEvent, { type: 'connection-state-changed' }>,
): void {
  const { ops, store } = context;

  if (event.state === 'connecting') {
    ops.setVoiceSessionStatus(ops.isVoiceResumptionInFlight() ? 'recovering' : 'connecting');
    return;
  }

  if (event.state === 'connected') {
    const wasResumption = ops.isVoiceResumptionInFlight();
    ops.setVoiceSessionStatus('ready');
    ops.resetVoiceToolState();
    store.setAssistantActivity('idle');
    store.setActiveTransport(LIVE_ADAPTER_KEY);
    store.setLastRuntimeError(null);
    ops.resetVoiceTurnTranscriptState();
    ops.setVoiceSessionResumption({
      status: wasResumption ? 'resumed' : 'connected',
      lastDetail:
        wasResumption
          ? store.voiceSessionResumption.lastDetail
          : null,
    });
    ops.syncVoiceDurabilityState(ops.getToken(), {
      lastDetail: store.voiceSessionDurability.lastDetail,
    });
    ops.setVoiceResumptionInFlight(false);
    ops.setVoicePlaybackState('idle');
    ops.updateVoicePlaybackDiagnostics({
      chunkCount: 0,
      queueDepth: 0,
      sampleRateHz: null,
      lastError: null,
      selectedOutputDeviceId:
        ops.settingsStore.getState().settings.selectedOutputDeviceId,
    });

    if (store.screenShareIntended && store.screenCaptureState === 'disabled') {
      ops.restoreScreenCapture();
    }

    return;
  }

  if (ops.isVoiceResumptionInFlight()) {
    ops.setVoiceSessionStatus('recovering');
    return;
  }

  ops.setVoiceSessionStatus('disconnected');
  ops.cancelVoiceToolCalls('voice transport disconnected');
  ops.resetVoiceTurnTranscriptState();
  ops.resetVoiceToolState();
  void ops.stopVoicePlayback();
  ops.cleanupTransport();
  store.setAssistantActivity('idle');
  store.setActiveTransport(null);
}

function handleGoAway(
  context: TransportEventRouterContext,
  event: Extract<LiveSessionEvent, { type: 'go-away' }>,
): void {
  const { ops, store } = context;
  const detail = getUnavailableDetail(event.detail);
  const voiceStatus = ops.currentVoiceSessionStatus();

  if (shouldIgnoreTermination(voiceStatus)) {
    ops.logRuntimeDiagnostic('voice-session', 'ignored go-away while not resumable', {
      detail,
      voiceStatus,
    });
    return;
  }

  logResumeRequest(context, detail, 'resume requested after go-away');
  ops.cancelVoiceToolCalls(detail);
  store.setVoiceSessionLatency(invalidateVoiceSessionLatency(store.voiceSessionLatency));
  ops.setVoiceSessionResumption({
    status: 'goAway',
    lastDetail: detail,
  });
  ops.setVoiceSessionDurability({
    tokenValid: isTokenValidForReconnect(ops.getToken()),
    lastDetail: detail,
  });
  void ops.resumeVoiceSession(detail);
}

function handleConnectionTerminated(
  context: TransportEventRouterContext,
  event: Extract<LiveSessionEvent, { type: 'connection-terminated' }>,
): void {
  const { ops, store } = context;
  const detail = getUnavailableDetail(event.detail);
  const voiceStatus = ops.currentVoiceSessionStatus();

  if (shouldIgnoreTermination(voiceStatus)) {
    ops.logRuntimeDiagnostic('voice-session', 'ignored connection termination while not resumable', {
      detail,
      voiceStatus,
    });
    return;
  }

  logResumeRequest(context, detail, 'resume requested after connection termination');
  ops.cancelVoiceToolCalls(detail);
  store.setVoiceSessionLatency(invalidateVoiceSessionLatency(store.voiceSessionLatency));
  ops.setVoiceSessionDurability({
    tokenValid: isTokenValidForReconnect(ops.getToken()),
    lastDetail: detail,
  });
  void ops.resumeVoiceSession(detail);
}

function handleSessionResumptionUpdate(
  context: TransportEventRouterContext,
  event: Extract<LiveSessionEvent, { type: 'session-resumption-update' }>,
): void {
  const { ops, store } = context;
  const updatedAt = new Date().toISOString();
  const groundingChangedForCurrentSession =
    store.activeVoiceSessionGroundingEnabled !== null
    && store.activeVoiceSessionGroundingEnabled !== ops.settingsStore.getState().settings.groundingEnabled;
  const resumable = groundingChangedForCurrentSession ? false : event.resumable;
  const detail = groundingChangedForCurrentSession
    ? GROUNDING_SESSION_RESTART_DETAIL
    : (event.detail ?? null);

  ops.logRuntimeDiagnostic('voice-session', 'resumption handle updated', {
    previousHandle: store.voiceSessionResumption.latestHandle,
    latestHandle: event.handle,
    resumable,
    detail,
    groundingChangedForCurrentSession,
  });
  ops.setVoiceSessionResumption({
    latestHandle: event.handle,
    resumable,
    lastDetail: detail,
  });
  store.setVoiceSessionRecoveryDiagnostics({
    transitionCount: store.voiceSessionRecoveryDiagnostics.transitionCount + 1,
    lastTransition: 'session-resumption-updated',
    lastTransitionAt: updatedAt,
    lastRecoveryDetail: detail,
  });
  ops.persistLiveSessionResumption({
    resumptionHandle: event.handle,
    lastResumptionUpdateAt: updatedAt,
    restorable: resumable,
    invalidatedAt: resumable ? null : updatedAt,
    invalidationReason: resumable ? null : detail,
  });
}

function handleAudioError(
  context: TransportEventRouterContext,
  event: Extract<LiveSessionEvent, { type: 'audio-error' }>,
): void {
  const { ops, store } = context;

  ops.updateVoicePlaybackDiagnostics({
    lastError: event.detail,
  });
  store.setLastRuntimeError(event.detail);
  void ops.stopVoicePlayback('error');
}

export function handleTransportSessionEvent(
  context: TransportEventRouterContext,
  event: LiveSessionEvent,
): void {
  const { ops } = context;

  switch (event.type) {
    case 'connection-state-changed':
      handleConnectionStateChanged(context, event);
      return;
    case 'go-away':
      handleGoAway(context, event);
      return;
    case 'connection-terminated':
      handleConnectionTerminated(context, event);
      return;
    case 'error':
      ops.cancelVoiceToolCalls(event.detail);
      ops.setVoiceErrorState(event.detail);
      return;
    case 'session-resumption-update':
      handleSessionResumptionUpdate(context, event);
      return;
    case 'audio-error':
      handleAudioError(context, event);
      return;
    default:
      return;
  }
}
