import {
  getEffectiveVoiceSessionCapabilities,
  getLiveConfig,
  LIVE_ADAPTER_KEY,
} from '../transport/liveConfig';
import { asErrorDetail } from '../core/runtimeUtils';
import { createSessionVoiceConnection } from './sessionVoiceConnection';
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
  AssistantVoice,
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
  currentGroundingEnabled: () => boolean;
  setActiveVoiceSessionGroundingEnabled: (enabled: boolean | null) => void;
  selectedOutputDeviceId: () => string;
  setVoiceSessionStatus: (status: 'connecting' | 'recovering') => void;
  resetVoiceSessionResumption: () => void;
  resetVoiceSessionDurability: () => void;
  resetVoiceToolState: () => void;
  ensureCurrentChatForSpeechStart: () => Promise<void>;
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
  resolveSessionVoice: () => Promise<AssistantVoice>;
  createPersistedLiveSession: (voice: AssistantVoice) => Promise<void>;
  endPersistedLiveSession: (liveSessionEnd: {
    status: 'ended' | 'failed';
    endedReason?: string | null;
  }) => Promise<void>;
  onRestoredSessionConnected: () => void;
  setVoiceResumptionInFlight: (value: boolean) => void;
  createTransport: (options?: { voice?: AssistantVoice }) => DesktopSession;
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
  currentGroundingEnabled,
  setActiveVoiceSessionGroundingEnabled,
  selectedOutputDeviceId,
  setVoiceSessionStatus,
  resetVoiceSessionResumption,
  resetVoiceSessionDurability,
  resetVoiceToolState,
  ensureCurrentChatForSpeechStart,
  requestVoiceSessionToken,
  buildRehydrationPacketFromCurrentChat,
  setCachedVoiceToken,
  syncVoiceDurabilityState,
  restorePersistedLiveSession,
  invalidatePersistedLiveSession,
  resolveSessionVoice,
  createPersistedLiveSession,
  endPersistedLiveSession,
  onRestoredSessionConnected,
  setVoiceResumptionInFlight,
  createTransport,
  activateVoiceTransport,
  startVoiceCapture,
  setVoiceErrorState,
  checkBackendHealth,
  textRuntimeFailed,
  logRuntimeDiagnostic,
}: SessionControllerLifecycleArgs) {
  const voiceConnection = createSessionVoiceConnection({
    store,
    isCurrentSessionOperation,
    applySpeechLifecycleEvent,
    setVoiceResumptionInFlight,
    createTransport,
    activateVoiceTransport,
    buildRehydrationPacketFromCurrentChat,
    invalidatePersistedLiveSession,
    resolveSessionVoice,
    createPersistedLiveSession,
    endPersistedLiveSession,
    logRuntimeDiagnostic,
  });
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

  const autoStartVoiceCaptureIfCurrent = async (operationId: number): Promise<void> => {
    if (!isCurrentSessionOperation(operationId)) {
      return;
    }

    await startVoiceCapture();
  };

  const startSessionInternal = async (_options: { mode: 'speech' }): Promise<void> => {
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
    setActiveVoiceSessionGroundingEnabled(currentGroundingEnabled());
    const effectiveVoiceSessionCapabilities = getEffectiveVoiceSessionCapabilities(getLiveConfig());
    store.getState().setEffectiveVoiceSessionCapabilities(effectiveVoiceSessionCapabilities);
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
      capabilities: effectiveVoiceSessionCapabilities,
    });

    try {
      await ensureCurrentChatForSpeechStart();
    } catch (error) {
      await setVoiceErrorState(asErrorDetail(error, 'Failed to create chat'));
      return;
    }

    if (!isCurrentSessionOperation(operationId)) {
      return;
    }

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
        const restoreAttempt = await voiceConnection.connectRestoredSession(
          operationId,
          token,
          persistedLiveSession,
        );

        if (restoreAttempt.status === 'resumed' || !isCurrentSessionOperation(operationId)) {
          if (restoreAttempt.status === 'resumed') {
            onRestoredSessionConnected();
            await autoStartVoiceCaptureIfCurrent(operationId);
          }
          return;
        }

        const fallbackAttempt = await voiceConnection.connectFallbackSession(
          operationId,
          token,
          'resume-failed',
          restoreAttempt.detail,
        );

        if (fallbackAttempt.status === 'connected' || !isCurrentSessionOperation(operationId)) {
          if (fallbackAttempt.status === 'connected') {
            await autoStartVoiceCaptureIfCurrent(operationId);
          }
          return;
        }

        await setVoiceErrorState(fallbackAttempt.detail);
        return;
      }
    } catch (error) {
      await setVoiceErrorState(asErrorDetail(error, 'Failed to restore voice session'));
      return;
    }

    const fallbackAttempt = await voiceConnection.connectFallbackSession(
      operationId,
      token,
      'no-restore-candidate',
    );

    if (fallbackAttempt.status === 'connected' || !isCurrentSessionOperation(operationId)) {
      if (fallbackAttempt.status === 'connected') {
        await autoStartVoiceCaptureIfCurrent(operationId);
      }
      return;
    }

    await setVoiceErrorState(fallbackAttempt.detail);
  };

  return {
    performBackendHealthCheck,
    startSessionInternal,
  };
}
