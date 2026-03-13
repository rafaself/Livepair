import { LIVE_ADAPTER_KEY } from '../transport/liveConfig';
import { asErrorDetail } from '../core/runtimeUtils';
import { connectFallbackVoiceSession } from '../voice/connectFallbackVoiceSession';
import type {
  SessionControllerEvent,
} from '../core/session.types';
import type { DesktopSession } from '../transport/transport.types';
import type { SessionStoreApi } from '../core/sessionControllerTypes';
import type {
  VoiceSessionDurabilityState,
  VoiceSessionStatus,
} from '../voice/voice.types';
import type {
  CreateEphemeralTokenResponse,
  LiveSessionRecord,
  RehydrationPacket,
} from '@livepair/shared-types';

type SessionControllerLifecycleArgs = {
  store: SessionStoreApi;
  beginSessionOperation: () => number;
  isCurrentSessionOperation: (operationId: number) => boolean;
  ensureExclusiveMode: (targetMode: 'speech', operationId: number) => Promise<void>;
  currentVoiceSessionStatus: () => VoiceSessionStatus;
  recordSessionEvent: (event: SessionControllerEvent) => void;
  applySpeechLifecycleEvent: (event: { type: string }) => void;
  setVoiceCaptureState: (state: 'idle') => void;
  setVoiceCaptureDiagnostics: (patch: { lastError: null }) => void;
  setVoicePlaybackState: (state: 'idle') => void;
  updateVoicePlaybackDiagnostics: (patch: {
    chunkCount: number;
    queueDepth: number;
    sampleRateHz: null;
    selectedOutputDeviceId: string;
    lastError: null;
  }) => void;
  selectedOutputDeviceId: () => string;
  setVoiceSessionStatus: (status: 'connecting' | 'recovering') => void;
  resetVoiceSessionResumption: () => void;
  resetVoiceSessionDurability: () => void;
  resetVoiceToolState: () => void;
  requestVoiceSessionToken: (operationId: number) => Promise<CreateEphemeralTokenResponse | null>;
  buildRehydrationPacketFromCurrentChat: () => Promise<RehydrationPacket>;
  setCachedVoiceToken: (token: CreateEphemeralTokenResponse) => void;
  syncVoiceDurabilityState: (
    token: CreateEphemeralTokenResponse | null,
    patch?: Partial<VoiceSessionDurabilityState>,
  ) => void;
  restorePersistedLiveSession: () => Promise<LiveSessionRecord | null>;
  invalidatePersistedLiveSession: (patch: {
    restorable: false;
    invalidatedAt: string;
    invalidationReason: string;
  }) => Promise<void>;
  createPersistedLiveSession: () => Promise<void>;
  endPersistedLiveSession: (liveSessionEnd: {
    status: 'ended' | 'failed';
    endedReason?: string | null;
  }) => Promise<void>;
  setVoiceResumptionInFlight: (value: boolean) => void;
  createTransport: () => DesktopSession;
  activateVoiceTransport: (transport: DesktopSession) => void;
  startVoiceCapture: () => Promise<boolean>;
  setVoiceErrorState: (detail: string) => Promise<void>;
  checkBackendHealth: () => Promise<boolean>;
  textRuntimeFailed: () => void;
  logRuntimeDiagnostic: (
    scope: 'session' | 'voice-session',
    message: string,
    detail: Record<string, unknown>,
  ) => void;
};

type RestoreAttemptResult =
  | { status: 'resumed' }
  | { status: 'failed'; detail: string };

type FallbackAttemptResult =
  | { status: 'connected' }
  | { status: 'failed'; detail: string };

export function createSessionControllerLifecycle({
  store,
  beginSessionOperation,
  isCurrentSessionOperation,
  ensureExclusiveMode,
  currentVoiceSessionStatus,
  recordSessionEvent,
  applySpeechLifecycleEvent,
  setVoiceCaptureState,
  setVoiceCaptureDiagnostics,
  setVoicePlaybackState,
  updateVoicePlaybackDiagnostics,
  selectedOutputDeviceId,
  setVoiceSessionStatus,
  resetVoiceSessionResumption,
  resetVoiceSessionDurability,
  resetVoiceToolState,
  requestVoiceSessionToken,
  buildRehydrationPacketFromCurrentChat,
  setCachedVoiceToken,
  syncVoiceDurabilityState,
  restorePersistedLiveSession,
  invalidatePersistedLiveSession,
  createPersistedLiveSession,
  endPersistedLiveSession,
  setVoiceResumptionInFlight,
  createTransport,
  activateVoiceTransport,
  startVoiceCapture,
  setVoiceErrorState,
  checkBackendHealth,
  textRuntimeFailed,
  logRuntimeDiagnostic,
}: SessionControllerLifecycleArgs) {
  const performBackendHealthCheck = async (operationId?: number): Promise<boolean> => {
    const sessionStore = store.getState();

    recordSessionEvent({ type: 'session.backend.health.started' });
    sessionStore.setBackendState('checking');

    try {
      const isHealthy = await checkBackendHealth();

      if (operationId && !isCurrentSessionOperation(operationId)) {
        return false;
      }

      if (!isHealthy) {
        const detail = 'Backend health check failed';
        sessionStore.setBackendState('failed');
        sessionStore.setLastRuntimeError(detail);
        textRuntimeFailed();
        recordSessionEvent({ type: 'session.backend.health.failed', detail });
        return false;
      }

      sessionStore.setBackendState('connected');
      recordSessionEvent({ type: 'session.backend.health.succeeded' });
      return true;
    } catch (error) {
      if (operationId && !isCurrentSessionOperation(operationId)) {
        return false;
      }

      const detail = asErrorDetail(error, 'Backend health check failed');
      sessionStore.setBackendState('failed');
      sessionStore.setLastRuntimeError(detail);
      textRuntimeFailed();
      recordSessionEvent({ type: 'session.backend.health.failed', detail });
      return false;
    }
  };

  const connectRestoredSession = async (
    operationId: number,
    token: CreateEphemeralTokenResponse,
    liveSession: LiveSessionRecord,
  ): Promise<RestoreAttemptResult> => {
    if (!liveSession.restorable || !liveSession.resumptionHandle) {
      const detail = liveSession.restorable
        ? 'Persisted Live session is missing a resume handle'
        : liveSession.invalidationReason ?? 'Persisted Live session is no longer restorable';
      await invalidatePersistedLiveSession({
        restorable: false,
        invalidatedAt: new Date().toISOString(),
        invalidationReason: detail,
      });
      await endPersistedLiveSession({
        status: 'failed',
        endedReason: detail,
      });
      return { status: 'failed', detail };
    }

    store.getState().setLastRuntimeError(null);
    store.getState().setVoiceSessionResumption({
      status: 'reconnecting',
      latestHandle: liveSession.resumptionHandle,
      resumable: true,
      lastDetail: 'Restoring persisted Live session',
    });
    setVoiceResumptionInFlight(true);

    let transport: DesktopSession;
    try {
      transport = createTransport();
    } catch (error) {
      const detail = asErrorDetail(error, 'Failed to prepare voice session');
      await invalidatePersistedLiveSession({
        restorable: false,
        invalidatedAt: new Date().toISOString(),
        invalidationReason: detail,
      });
      await endPersistedLiveSession({
        status: 'failed',
        endedReason: detail,
      });
      setVoiceResumptionInFlight(false);
      return { status: 'failed', detail };
    }

    activateVoiceTransport(transport);

    try {
      await transport.connect({
        token,
        mode: 'voice',
        resumeHandle: liveSession.resumptionHandle,
      });

      if (!isCurrentSessionOperation(operationId)) {
        return { status: 'failed', detail: 'Voice session resumption was superseded' };
      }

      const didStartVoiceCapture = await startVoiceCapture();

      if (!didStartVoiceCapture || !isCurrentSessionOperation(operationId)) {
        return { status: 'failed', detail: 'Failed to start voice capture after session resumption' };
      }

      applySpeechLifecycleEvent({ type: 'session.ready' });
      return { status: 'resumed' };
    } catch (error) {
      const detail = asErrorDetail(error, 'Failed to resume voice session');
      await invalidatePersistedLiveSession({
        restorable: false,
        invalidatedAt: new Date().toISOString(),
        invalidationReason: detail,
      });
      await endPersistedLiveSession({
        status: 'failed',
        endedReason: detail,
      });
      setVoiceResumptionInFlight(false);
      store.getState().setVoiceSessionResumption({
        status: 'resumeFailed',
        latestHandle: liveSession.resumptionHandle,
        resumable: false,
        lastDetail: detail,
      });
      logRuntimeDiagnostic('voice-session', 'restore attempt failed', {
        liveSessionId: liveSession.id,
        detail,
      });
      return { status: 'failed', detail };
    }
  };

  const connectFallbackSession = async (
    operationId: number,
    token: CreateEphemeralTokenResponse,
    reason: 'no-restore-candidate' | 'resume-failed',
    previousDetail: string | null = null,
  ): Promise<FallbackAttemptResult> => {
    return connectFallbackVoiceSession({
      operationId,
      token,
      reason,
      previousDetail,
      logRuntimeDiagnostic,
      buildRehydrationPacketFromCurrentChat,
      isCurrentSessionOperation,
      createTransport,
      createPersistedLiveSession,
      activateVoiceTransport,
      setVoiceResumptionInFlight,
      startVoiceCapture,
      applySpeechLifecycleEvent: (event) => {
        applySpeechLifecycleEvent(event);
      },
    });
  };

  const startSessionInternal = async (_options: { mode: 'voice' }): Promise<void> => {
    const operationId = beginSessionOperation();
    await ensureExclusiveMode('speech', operationId);

    if (!isCurrentSessionOperation(operationId)) {
      return;
    }

    if (currentVoiceSessionStatus() !== 'disconnected' && currentVoiceSessionStatus() !== 'error') {
      return;
    }

    applySpeechLifecycleEvent({ type: 'session.start.requested' });
    setVoiceCaptureState('idle');
    setVoiceCaptureDiagnostics({ lastError: null });
    setVoicePlaybackState('idle');
    updateVoicePlaybackDiagnostics({
      chunkCount: 0,
      queueDepth: 0,
      sampleRateHz: null,
      selectedOutputDeviceId: selectedOutputDeviceId(),
      lastError: null,
    });
    setVoiceSessionStatus('connecting');
    resetVoiceSessionResumption();
    resetVoiceSessionDurability();
    resetVoiceToolState();
    recordSessionEvent({
      type: 'session.start.requested',
      transport: LIVE_ADAPTER_KEY,
    });
    logRuntimeDiagnostic('voice-session', 'start requested', {
      transport: LIVE_ADAPTER_KEY,
    });
    const token = await requestVoiceSessionToken(operationId);

    if (!token || !isCurrentSessionOperation(operationId)) {
      return;
    }

    setCachedVoiceToken(token);
    syncVoiceDurabilityState(token);
    setVoiceResumptionInFlight(false);
    resetVoiceSessionResumption();

    try {
      const persistedLiveSession = await restorePersistedLiveSession();

      if (!isCurrentSessionOperation(operationId)) {
        return;
      }

      if (persistedLiveSession) {
        const restoreAttempt = await connectRestoredSession(operationId, token, persistedLiveSession);

        if (restoreAttempt.status === 'resumed' || !isCurrentSessionOperation(operationId)) {
          return;
        }

        const fallbackAttempt = await connectFallbackSession(
          operationId,
          token,
          'resume-failed',
          restoreAttempt.detail,
        );

        if (fallbackAttempt.status === 'connected' || !isCurrentSessionOperation(operationId)) {
          return;
        }

        await setVoiceErrorState(fallbackAttempt.detail);
        return;
      }
    } catch (error) {
      await setVoiceErrorState(asErrorDetail(error, 'Failed to restore voice session'));
      return;
    }

    const fallbackAttempt = await connectFallbackSession(
      operationId,
      token,
      'no-restore-candidate',
    );

    if (fallbackAttempt.status === 'connected' || !isCurrentSessionOperation(operationId)) {
      return;
    }

    await setVoiceErrorState(fallbackAttempt.detail);
  };

  return {
    performBackendHealthCheck,
    startSessionInternal,
  };
}
