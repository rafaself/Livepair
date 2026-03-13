import { LIVE_ADAPTER_KEY } from './transport/liveConfig';
import { asErrorDetail } from './core/runtimeUtils';
import type {
  SessionControllerEvent,
} from './core/session.types';
import type { DesktopSession } from './transport/transport.types';
import type { SessionStoreApi } from './core/sessionControllerTypes';
import type {
  VoiceSessionDurabilityState,
  VoiceSessionStatus,
} from './voice/voice.types';
import type {
  CreateEphemeralTokenResponse,
  LiveSessionRecord,
} from '@livepair/shared-types';
import type { LiveSessionHistoryTurn } from './transport/transport.types';

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
  buildLiveSessionHistoryFromCurrentChat: () => Promise<LiveSessionHistoryTurn[]>;
  setCachedVoiceToken: (token: CreateEphemeralTokenResponse) => void;
  syncVoiceDurabilityState: (
    token: CreateEphemeralTokenResponse | null,
    patch?: Partial<VoiceSessionDurabilityState>,
  ) => void;
  restorePersistedLiveSession: () => Promise<LiveSessionRecord | null>;
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
  buildLiveSessionHistoryFromCurrentChat,
  setCachedVoiceToken,
  syncVoiceDurabilityState,
  restorePersistedLiveSession,
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
  ): Promise<boolean> => {
    if (!liveSession.resumable || !liveSession.latestResumeHandle) {
      await endPersistedLiveSession({
        status: 'failed',
        endedReason: liveSession.resumable
          ? 'Persisted Live session is missing a resume handle'
          : 'Persisted Live session is no longer resumable',
      });
      return false;
    }

    store.getState().setLastRuntimeError(null);
    store.getState().setVoiceSessionResumption({
      status: 'reconnecting',
      latestHandle: liveSession.latestResumeHandle,
      resumable: true,
      lastDetail: 'Restoring persisted Live session',
    });
    setVoiceResumptionInFlight(true);

    let transport: DesktopSession;
    try {
      transport = createTransport();
    } catch (error) {
      await endPersistedLiveSession({
        status: 'failed',
        endedReason: asErrorDetail(error, 'Failed to prepare voice session'),
      });
      setVoiceResumptionInFlight(false);
      return false;
    }

    activateVoiceTransport(transport);

    try {
      await transport.connect({
        token,
        mode: 'voice',
        resumeHandle: liveSession.latestResumeHandle,
      });

      if (!isCurrentSessionOperation(operationId)) {
        return false;
      }

      const didStartVoiceCapture = await startVoiceCapture();

      if (!didStartVoiceCapture || !isCurrentSessionOperation(operationId)) {
        return false;
      }

      applySpeechLifecycleEvent({ type: 'session.ready' });
      return true;
    } catch (error) {
      const detail = asErrorDetail(error, 'Failed to resume voice session');
      await endPersistedLiveSession({
        status: 'failed',
        endedReason: detail,
      });
      setVoiceResumptionInFlight(false);
      store.getState().setVoiceSessionResumption({
        status: 'resumeFailed',
        latestHandle: liveSession.latestResumeHandle,
        resumable: false,
        lastDetail: detail,
      });
      logRuntimeDiagnostic('voice-session', 'restore fell back to fresh session', {
        liveSessionId: liveSession.id,
        detail,
      });
      return false;
    }
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
        const didResume = await connectRestoredSession(operationId, token, persistedLiveSession);

        if (didResume || !isCurrentSessionOperation(operationId)) {
          return;
        }

        setVoiceSessionStatus('connecting');
        setVoiceResumptionInFlight(false);
        resetVoiceSessionResumption();
      }
    } catch (error) {
      await setVoiceErrorState(asErrorDetail(error, 'Failed to restore voice session'));
      return;
    }

    let history: LiveSessionHistoryTurn[];

    try {
      history = await buildLiveSessionHistoryFromCurrentChat();
    } catch (error) {
      if (!isCurrentSessionOperation(operationId)) {
        return;
      }

      await setVoiceErrorState(asErrorDetail(error, 'Failed to load chat history'));
      return;
    }

    let transport: DesktopSession;
    try {
      transport = createTransport();
    } catch (error) {
      if (!isCurrentSessionOperation(operationId)) {
        return;
      }

      await setVoiceErrorState(asErrorDetail(error, 'Failed to prepare voice session'));
      return;
    }

    await createPersistedLiveSession();
    activateVoiceTransport(transport);

    try {
      await transport.connect({
        token,
        mode: 'voice',
        ...(history.length > 0 ? { history } : {}),
      });

      if (!isCurrentSessionOperation(operationId)) {
        return;
      }

      const didStartVoiceCapture = await startVoiceCapture();

      if (!didStartVoiceCapture || !isCurrentSessionOperation(operationId)) {
        return;
      }

      applySpeechLifecycleEvent({ type: 'session.ready' });
    } catch (error) {
      if (!isCurrentSessionOperation(operationId)) {
        return;
      }

      await setVoiceErrorState(asErrorDetail(error, 'Failed to connect voice session'));
    }
  };

  return {
    performBackendHealthCheck,
    startSessionInternal,
  };
}
