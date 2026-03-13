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
import type { CreateEphemeralTokenResponse } from '@livepair/shared-types';
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
  setVoiceSessionStatus: (status: 'connecting') => void;
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
  createPersistedLiveSession: () => Promise<void>;
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
  createPersistedLiveSession,
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
    const historyPromise = buildLiveSessionHistoryFromCurrentChat();

    const token = await requestVoiceSessionToken(operationId);

    if (!token || !isCurrentSessionOperation(operationId)) {
      void historyPromise.catch(() => undefined);
      return;
    }

    let history: LiveSessionHistoryTurn[];

    try {
      history = await historyPromise;
    } catch (error) {
      if (!isCurrentSessionOperation(operationId)) {
        return;
      }

      await setVoiceErrorState(asErrorDetail(error, 'Failed to load chat history'));
      return;
    }

    setCachedVoiceToken(token);
    syncVoiceDurabilityState(token);
    setVoiceResumptionInFlight(false);
    resetVoiceSessionResumption();

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
