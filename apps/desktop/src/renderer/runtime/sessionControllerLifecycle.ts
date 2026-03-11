import { LIVE_ADAPTER_KEY } from './transport/liveConfig';
import {
  isSessionActiveLifecycle,
  isTextSessionConnectable,
} from './text/textSessionLifecycle';
import { asErrorDetail } from './core/runtimeUtils';
import type {
  SessionControllerEvent,
  SessionMode,
} from './core/session.types';
import type { DesktopSession } from './transport/transport.types';
import type { TransportKind } from './transport/transport.types';
import type { SessionStoreApi } from './core/sessionControllerTypes';
import type { TextSessionStatus } from './text/text.types';
import type {
  VoiceSessionDurabilityState,
  VoiceSessionStatus,
} from './voice/voice.types';
import type { CreateEphemeralTokenResponse } from '@livepair/shared-types';

type SessionControllerLifecycleArgs = {
  store: SessionStoreApi;
  beginSessionOperation: () => number;
  isCurrentSessionOperation: (operationId: number) => boolean;
  ensureExclusiveMode: (targetMode: 'text' | 'speech', operationId: number) => Promise<void>;
  resolveProductMode: (mode: SessionMode) => 'text' | 'speech';
  currentProductMode: () => 'text' | 'speech';
  currentVoiceSessionStatus: () => VoiceSessionStatus;
  currentTextSessionStatus: () => TextSessionStatus;
  hasSpeechRuntimeActivity: () => boolean;
  resetRuntimeState: (textSessionStatus?: TextSessionStatus) => void;
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
  setCachedVoiceToken: (token: CreateEphemeralTokenResponse) => void;
  syncVoiceDurabilityState: (
    token: CreateEphemeralTokenResponse | null,
    patch?: Partial<VoiceSessionDurabilityState>,
  ) => void;
  setVoiceResumptionInFlight: (value: boolean) => void;
  createTransport: () => DesktopSession;
  activateVoiceTransport: (transport: DesktopSession) => void;
  startVoiceCapture: () => Promise<boolean>;
  setVoiceErrorState: (detail: string) => void;
  checkBackendHealth: () => Promise<boolean>;
  textBootstrapStarted: () => void;
  textRuntimeFailed: () => void;
  textTransportConnected: () => void;
  textAdapterKey: TransportKind;
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
  resolveProductMode,
  currentProductMode,
  currentVoiceSessionStatus,
  currentTextSessionStatus,
  hasSpeechRuntimeActivity,
  resetRuntimeState,
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
  setCachedVoiceToken,
  syncVoiceDurabilityState,
  setVoiceResumptionInFlight,
  createTransport,
  activateVoiceTransport,
  startVoiceCapture,
  setVoiceErrorState,
  checkBackendHealth,
  textBootstrapStarted,
  textRuntimeFailed,
  textTransportConnected,
  textAdapterKey,
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

  const startSessionInternal = async ({
    mode,
  }: {
    mode: SessionMode;
  }): Promise<void> => {
    const targetMode = resolveProductMode(mode);

    if (mode === 'voice') {
      const operationId = beginSessionOperation();
      await ensureExclusiveMode(targetMode, operationId);

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

      const transport = createTransport();
      activateVoiceTransport(transport);

      try {
        await transport.connect({
          token,
          mode: 'voice',
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

        setVoiceErrorState(asErrorDetail(error, 'Failed to connect voice session'));
      }

      return;
    }

    const status = currentTextSessionStatus();

    if (
      currentProductMode() === 'text' &&
      !hasSpeechRuntimeActivity() &&
      !isTextSessionConnectable(status) &&
      isSessionActiveLifecycle(status)
    ) {
      return;
    }

    const operationId = beginSessionOperation();
    await ensureExclusiveMode(targetMode, operationId);

    if (!isCurrentSessionOperation(operationId)) {
      return;
    }

    resetRuntimeState();
    textBootstrapStarted();
    recordSessionEvent({
      type: 'session.start.requested',
      transport: textAdapterKey,
    });
    logRuntimeDiagnostic('session', 'start requested', {
      mode,
      transport: textAdapterKey,
    });

    const isHealthy = await performBackendHealthCheck(operationId);

    if (!isHealthy || !isCurrentSessionOperation(operationId)) {
      return;
    }

    textTransportConnected();
    store.getState().setActiveTransport(textAdapterKey);
    store.getState().setAssistantActivity('idle');
    store.getState().setLastRuntimeError(null);
  };

  return {
    performBackendHealthCheck,
    startSessionInternal,
  };
}
