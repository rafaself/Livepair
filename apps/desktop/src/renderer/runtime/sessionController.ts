import { checkBackendHealth, requestSessionToken, startTextChatStream } from '../api/backend';
import { useSessionStore } from '../store/sessionStore';
import { useSettingsStore } from '../store/settingsStore';
import {
  defaultRuntimeLogger,
  logLifecycleTransition,
  logRuntimeDiagnostic,
  logRuntimeError,
} from './logger';
import { createGeminiLiveTransport } from './geminiLiveTransport';
import { LIVE_ADAPTER_KEY } from './liveConfig';
import { createAssistantAudioPlayback } from './assistantAudioPlayback';
import { createLocalVoiceCapture } from './localVoiceCapture';
import { createLocalScreenCapture } from './localScreenCapture';
import {
  isSpeechLifecycleActive,
  reduceSpeechSessionLifecycle,
  type SpeechSessionLifecycleEvent,
} from './speechSessionLifecycle';
import { createVoiceTranscriptController } from './voiceTranscriptController';
import { createVoicePlaybackController } from './voicePlaybackController';
import { createScreenCaptureController } from './screenCaptureController';
import { createVoiceToolController } from './voiceToolController';
import { createVoiceInterruptionController } from './voiceInterruptionController';
import { createVoiceTokenManager } from './voiceTokenManager';
import { createSpeechSilenceController } from './speechSilenceController';
import { createConversationContext } from './conversationTurnManager';
import { createTextChatController } from './textChatController';
import { createTransportEventRouter } from './transportEventRouter';
import { createVoiceChunkPipeline } from './voiceChunkPipeline';
import { createVoiceResumeController } from './voiceResumeController';
import {
  createDefaultVoiceSessionDurabilityState,
  createDefaultVoiceSessionResumptionState,
} from './defaults';
import { asErrorDetail, createDebugEvent } from './runtimeUtils';
import {
  isSessionActiveLifecycle,
  isTextSessionConnectable,
} from './textSessionLifecycle';
import type {
  DesktopSession,
  AssistantAudioPlayback,
  SessionControllerEvent,
  SpeechLifecycleStatus,
  SessionMode,
  ProductMode,
  TextSessionStatus,
  VoiceSessionDurabilityState,
  VoiceSessionResumptionState,
  VoiceSessionStatus,
  VoicePlaybackDiagnostics,
  VoicePlaybackState,
  VoiceToolCall,
  VoiceToolState,
} from './types';
import type {
  CreateEphemeralTokenResponse,
} from '@livepair/shared-types';
import type {
  DesktopSessionController,
  DesktopSessionControllerDependencies,
  DebugAssistantState,
} from './sessionControllerTypes';

export type {
  DesktopSessionController,
  DesktopSessionControllerDependencies,
} from './sessionControllerTypes';


export function createDesktopSessionController(
  overrides: Partial<DesktopSessionControllerDependencies> = {},
): DesktopSessionController {
  const dependencies: DesktopSessionControllerDependencies = {
    logger: defaultRuntimeLogger,
    checkBackendHealth,
    startTextChatStream,
    requestSessionToken,
    createTransport: (_kind) => createGeminiLiveTransport(),
    createVoiceCapture: (observer) => createLocalVoiceCapture(observer),
    createVoicePlayback: (observer, options) =>
      createAssistantAudioPlayback(observer, options),
    createScreenCapture: (observer) => createLocalScreenCapture(observer),
    store: useSessionStore,
    settingsStore: useSettingsStore,
    ...overrides,
  };

  let activeTransport: DesktopSession | null = null;
  let unsubscribeTransport: (() => void) | null = null;
  let sessionOperationId = 0;
  const conversationCtx = createConversationContext(dependencies.store);
  const playbackCtrl = createVoicePlaybackController(
    dependencies.store,
    dependencies.settingsStore,
    dependencies.createVoicePlayback,
  );
  const screenCtrl = createScreenCaptureController(
    dependencies.store,
    dependencies.createScreenCapture,
    () => activeTransport,
  );
  const voiceToolCtrl = createVoiceToolController(
    dependencies.store,
    () => activeTransport,
    () => createVoiceToolExecutionSnapshot(),
    (detail) => setVoiceErrorState(detail),
  );
  const interruptionCtrl = createVoiceInterruptionController(
    dependencies.store,
    () => activeTransport,
    () => currentVoiceSessionStatus(),
    (status) => setVoiceSessionStatus(status),
    (event) => applySpeechLifecycleEvent(event),
    () => stopVoicePlayback(),
  );
  const voiceTranscript = createVoiceTranscriptController(dependencies.store);
  const tokenMgr = createVoiceTokenManager(
    dependencies.store,
    dependencies.requestSessionToken,
    (id) => isCurrentSessionOperation(id),
    (patch) => setVoiceSessionDurability(patch),
    (event) => recordSessionEvent(event),
    (detail) => setVoiceErrorState(detail),
    LIVE_ADAPTER_KEY,
  );
  let voiceResumptionInFlight = false;
  const silenceCtrl = createSpeechSilenceController(
    dependencies.settingsStore,
    () => void endSessionInternal(),
    () => applySpeechLifecycleEvent({ type: 'recovery.completed' }),
  );
  const voiceChunkCtrl = createVoiceChunkPipeline({
    store: dependencies.store,
    settingsStore: dependencies.settingsStore,
    createVoiceCapture: dependencies.createVoiceCapture,
    getActiveTransport: () => activeTransport,
    currentVoiceSessionStatus: () => currentVoiceSessionStatus(),
    setVoiceSessionStatus: (s) => setVoiceSessionStatus(s),
    setVoiceErrorState: (d) => setVoiceErrorState(d),
    endSessionInternal: (o) => void endSessionInternal(o),
    logRuntimeError,
  });
  const textChatCtrl = createTextChatController({
    store: dependencies.store,
    logger: dependencies.logger,
    startTextChatStream: dependencies.startTextChatStream,
    conversationCtx,
    startSessionInternal: (options) => startSessionInternal(options),
    setErrorState: (detail, label) => setErrorState(detail, label),
  });
  const transportRouter = createTransportEventRouter({
    store: dependencies.store,
    settingsStore: dependencies.settingsStore,
    logger: dependencies.logger,
    isVoiceResumptionInFlight: () => voiceResumptionInFlight,
    setVoiceResumptionInFlight: (v) => { voiceResumptionInFlight = v; },
    currentVoiceSessionStatus: () => currentVoiceSessionStatus(),
    currentSpeechLifecycleStatus: () => currentSpeechLifecycleStatus(),
    getToken: () => tokenMgr.get(),
    setVoiceSessionStatus: (s) => setVoiceSessionStatus(s),
    setVoiceSessionResumption: (p) => setVoiceSessionResumption(p),
    setVoiceSessionDurability: (p) => setVoiceSessionDurability(p),
    syncVoiceDurabilityState: (t, p) => syncVoiceDurabilityState(t, p),
    setVoicePlaybackState: (s) => setVoicePlaybackState(s),
    updateVoicePlaybackDiagnostics: (p) => updateVoicePlaybackDiagnostics(p),
    getVoicePlayback: () => getVoicePlayback(),
    stopVoicePlayback: (s) => stopVoicePlayback(s),
    resetVoiceToolState: () => resetVoiceToolState(),
    resetVoiceTurnTranscriptState: () => resetVoiceTurnTranscriptState(),
    markTurnCompleted: () => voiceTranscript.markTurnCompleted(),
    enqueueVoiceToolCalls: (c) => enqueueVoiceToolCalls(c),
    handleVoiceInterruption: () => handleVoiceInterruption(),
    applySpeechLifecycleEvent: (e) => applySpeechLifecycleEvent(e),
    applyVoiceTranscriptUpdate: (r, t, f) => applyVoiceTranscriptUpdate(r, t, f),
    setVoiceErrorState: (d) => setVoiceErrorState(d),
    cleanupTransport: () => cleanupTransport(),
    resumeVoiceSession: (d) => voiceResumeCtrl.resume(d),
  });
  const voiceResumeCtrl = createVoiceResumeController({
    store: dependencies.store,
    createTransport: dependencies.createTransport,
    getToken: () => tokenMgr.get(),
    beginSessionOperation: () => beginSessionOperation(),
    isCurrentSessionOperation: (id) => isCurrentSessionOperation(id),
    setVoiceSessionStatus: (s) => setVoiceSessionStatus(s),
    setVoiceSessionResumption: (p) => setVoiceSessionResumption(p),
    setVoiceSessionDurability: (p) => setVoiceSessionDurability(p),
    setVoiceErrorState: (d) => setVoiceErrorState(d),
    setVoiceResumptionInFlight: (v) => { voiceResumptionInFlight = v; },
    refreshToken: (id, d) => refreshVoiceSessionToken(id, d),
    stopVoicePlayback: () => stopVoicePlayback(),
    subscribeTransport: (t, h) => { unsubscribeTransport = t.subscribe(h); },
    handleTransportEvent: (e) => handleTransportEvent(e),
    getActiveTransport: () => activeTransport,
    setActiveTransport: (t) => { activeTransport = t; },
    unsubscribePreviousTransport: () => {
      unsubscribeTransport?.();
      unsubscribeTransport = null;
    },
    resetTransportDeps: () => {
      voiceChunkCtrl.resetSendChain();
      screenCtrl.resetSendChain();
      interruptionCtrl.reset();
      textChatCtrl.clearPendingAssistantTurn();
      voiceTranscript.resetTurnCompletedFlag();
    },
  });

  const recordSessionEvent = (event: SessionControllerEvent): void => {
    dependencies.logger.onSessionEvent(event);
    dependencies.store
      .getState()
      .setLastDebugEvent(
        createDebugEvent(
          'session',
          event.type,
          'detail' in event ? event.detail : undefined,
        ),
      );
  };

  const updateVoicePlaybackDiagnostics = (
    patch: Partial<VoicePlaybackDiagnostics>,
  ): void => {
    playbackCtrl.updateDiagnostics(patch);
  };

  const setVoicePlaybackState = (state: VoicePlaybackState): void => {
    playbackCtrl.setState(state);
  };

  const getVoicePlayback = (): AssistantAudioPlayback => {
    return playbackCtrl.getOrCreate();
  };

  const currentSpeechLifecycleStatus = (): SpeechLifecycleStatus => {
    return dependencies.store.getState().speechLifecycle.status;
  };

  const syncSpeechSilenceTimeout = (status: SpeechLifecycleStatus): void => {
    silenceCtrl.syncTimeout(status);
  };

  const handleSpeechLifecycleStatusChange = (
    status: SpeechLifecycleStatus,
  ): void => {
    silenceCtrl.handleStatusChange(status);
  };

  const applySpeechLifecycleEvent = (
    event: SpeechSessionLifecycleEvent,
  ): SpeechLifecycleStatus => {
    const store = dependencies.store.getState();
    const previousStatus = store.speechLifecycle.status;
    const nextLifecycle = reduceSpeechSessionLifecycle(store.speechLifecycle, event);

    if (nextLifecycle.status !== previousStatus) {
      store.setSpeechLifecycle(nextLifecycle);
      logLifecycleTransition(previousStatus, nextLifecycle.status, event.type);
      handleSpeechLifecycleStatusChange(nextLifecycle.status);
    }

    return nextLifecycle.status;
  };

  const currentVoiceSessionStatus = (): VoiceSessionStatus => {
    return dependencies.store.getState().voiceSessionStatus;
  };

  const currentProductMode = (): ProductMode => {
    return dependencies.store.getState().currentMode;
  };

  const setCurrentMode = (mode: ProductMode): void => {
    dependencies.store.getState().setCurrentMode(mode);
  };

  const resolveProductMode = (mode: SessionMode): ProductMode => {
    return mode === 'voice' ? 'speech' : 'text';
  };

  const setVoiceSessionStatus = (status: VoiceSessionStatus): void => {
    dependencies.store.getState().setVoiceSessionStatus(status);
  };

  const setVoiceSessionResumption = (
    patch: Partial<VoiceSessionResumptionState>,
  ): void => {
    dependencies.store.getState().setVoiceSessionResumption(patch);
  };

  const resetVoiceSessionResumption = (): void => {
    setVoiceSessionResumption(createDefaultVoiceSessionResumptionState());
  };

  const setVoiceSessionDurability = (
    patch: Partial<VoiceSessionDurabilityState>,
  ): void => {
    dependencies.store.getState().setVoiceSessionDurability(patch);
  };

  const resetVoiceSessionDurability = (): void => {
    dependencies.store
      .getState()
      .setVoiceSessionDurability(createDefaultVoiceSessionDurabilityState());
  };

  const setVoiceToolState = (
    patch: Partial<VoiceToolState>,
  ): void => {
    voiceToolCtrl.setState(patch);
  };

  const resetVoiceToolState = (): void => {
    voiceToolCtrl.reset();
  };

  const clearCurrentVoiceTranscript = (): void => {
    voiceTranscript.clearTranscript();
  };

  const resetVoiceTurnTranscriptState = (): void => {
    voiceTranscript.resetTurnTranscriptState();
  };

  const applyVoiceTranscriptUpdate = (
    role: 'user' | 'assistant',
    text: string,
    isFinal?: boolean,
  ): void => {
    voiceTranscript.applyTranscriptUpdate(role, text, isFinal);
  };

  const cleanupTransport = (): void => {
    unsubscribeTransport?.();
    unsubscribeTransport = null;
    activeTransport = null;
    playbackCtrl.release();
    voiceChunkCtrl.resetSendChain();
    voiceToolCtrl.resetChain();
    screenCtrl.resetSendChain();
    interruptionCtrl.reset();
    textChatCtrl.releaseStream();
    silenceCtrl.clearAll();
    textChatCtrl.clearPendingAssistantTurn();
    voiceTranscript.resetTurnCompletedFlag();
  };

  const beginSessionOperation = (): number => {
    sessionOperationId += 1;
    return sessionOperationId;
  };

  const isCurrentSessionOperation = (operationId: number): boolean =>
    operationId === sessionOperationId;

  const resetRuntimeState = (textSessionStatus: TextSessionStatus = 'idle'): void => {
    textChatCtrl.resetRuntime(textSessionStatus);
    voiceTranscript.resetTurnCompletedFlag();
  };

  const createVoiceToolExecutionSnapshot = () => {
    const store = dependencies.store.getState();

    return {
      currentMode: store.currentMode,
      textSessionStatus: store.textSessionLifecycle.status,
      speechLifecycleStatus: store.speechLifecycle.status,
      voiceSessionStatus: store.voiceSessionStatus,
      voiceCaptureState: store.voiceCaptureState,
      voicePlaybackState: store.voicePlaybackState,
    };
  };

  const syncVoiceDurabilityState = (
    token: CreateEphemeralTokenResponse | null,
    patch: Partial<VoiceSessionDurabilityState> = {},
  ): void => {
    tokenMgr.syncDurabilityState(token, patch);
  };

  const setErrorState = (
    detail: string,
    failedTurnStatusLabel = 'Disconnected',
  ): void => {
    textChatCtrl.applyLifecycleEvent({ type: 'runtime.failed' });
    logRuntimeError('session', 'runtime entered error state', { detail });
    textChatCtrl.failPendingAssistantTurn(failedTurnStatusLabel);
    cleanupTransport();
    const store = dependencies.store.getState();
    store.setAssistantActivity('idle');
    store.setActiveTransport(null);
    store.setLastRuntimeError(detail);
  };

  const setVoiceErrorState = (detail: string): void => {
    logRuntimeError('voice-session', 'runtime entered error state', { detail });
    const store = dependencies.store.getState();
    resetVoiceTurnTranscriptState();
    voiceResumptionInFlight = false;
    tokenMgr.clear();
    if (store.voiceSessionResumption.status !== 'idle') {
      setVoiceSessionResumption({
        status: 'resumeFailed',
        resumable: false,
        lastDetail: detail,
      });
    }
    store.setVoiceSessionStatus('error');
    store.setLastRuntimeError(detail);
    setVoiceToolState({
      status: 'toolError',
      lastError: detail,
    });
    void endSessionInternal({
      preserveLastRuntimeError: detail,
      preserveVoiceRuntimeDiagnostics: true,
    });
  };

  const stopVoicePlayback = (
    nextState: VoicePlaybackState = 'stopped',
  ): Promise<void> => {
    return playbackCtrl.stop(nextState);
  };

  const stopScreenCaptureInternal = (
    options: {
      nextState?: 'disabled' | 'error';
      detail?: string | null;
      preserveDiagnostics?: boolean;
      uploadStatus?: 'idle' | 'error';
    } = {},
  ): void => {
    screenCtrl.stopInternal(options);
  };

  const handleVoiceInterruption = (): void => {
    interruptionCtrl.handle();
  };

  const enqueueVoiceToolCalls = (calls: VoiceToolCall[]): void => {
    voiceToolCtrl.enqueue(calls);
  };

  const { handleTransportEvent } = transportRouter;

  const requestVoiceSessionToken = (operationId: number) => {
    return tokenMgr.request(operationId);
  };

  const refreshVoiceSessionToken = (
    operationId: number,
    detail: string,
  ): Promise<CreateEphemeralTokenResponse | null> => {
    return tokenMgr.refresh(operationId, detail);
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

      const store = dependencies.store.getState();
      applySpeechLifecycleEvent({ type: 'session.start.requested' });
      store.setVoiceCaptureState('idle');
      store.setVoiceCaptureDiagnostics({
        lastError: null,
      });
      setVoicePlaybackState('idle');
      updateVoicePlaybackDiagnostics({
        chunkCount: 0,
        queueDepth: 0,
        sampleRateHz: null,
        selectedOutputDeviceId:
          dependencies.settingsStore.getState().settings.selectedOutputDeviceId,
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

      tokenMgr.set(token);
      syncVoiceDurabilityState(token);
      voiceResumptionInFlight = false;
      resetVoiceSessionResumption();

      const transport = dependencies.createTransport(LIVE_ADAPTER_KEY);
      cleanupTransport();
      activeTransport = transport;
      unsubscribeTransport = transport.subscribe(handleTransportEvent);

      try {
        await transport.connect({
          token,
          mode: 'voice',
        });

        if (!isCurrentSessionOperation(operationId)) {
          return;
        }

        const didStartVoiceCapture = await voiceChunkCtrl.startCapture({
          shutdownOnFailure: true,
        });

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

    const status = textChatCtrl.currentStatus();

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
    textChatCtrl.applyLifecycleEvent({ type: 'bootstrap.started' });
    recordSessionEvent({
      type: 'session.start.requested',
      transport: textChatCtrl.TEXT_CHAT_ADAPTER_KEY,
    });
    logRuntimeDiagnostic('session', 'start requested', {
      mode,
      transport: textChatCtrl.TEXT_CHAT_ADAPTER_KEY,
    });

    const isHealthy = await performBackendHealthCheck(operationId);

    if (!isHealthy || !isCurrentSessionOperation(operationId)) {
      return;
    }

    textChatCtrl.applyLifecycleEvent({ type: 'transport.connected' });
    dependencies.store.getState().setActiveTransport(textChatCtrl.TEXT_CHAT_ADAPTER_KEY);
    dependencies.store.getState().setAssistantActivity('idle');
    dependencies.store.getState().setLastRuntimeError(null);
  };

  const performBackendHealthCheck = async (operationId?: number): Promise<boolean> => {
    const store = dependencies.store.getState();

    recordSessionEvent({ type: 'session.backend.health.started' });
    store.setBackendState('checking');

    try {
      const isHealthy = await dependencies.checkBackendHealth();

      if (operationId && !isCurrentSessionOperation(operationId)) {
        return false;
      }

      if (!isHealthy) {
        const detail = 'Backend health check failed';
        store.setBackendState('failed');
        store.setLastRuntimeError(detail);
        textChatCtrl.applyLifecycleEvent({ type: 'runtime.failed' });
        recordSessionEvent({ type: 'session.backend.health.failed', detail });
        return false;
      }

      store.setBackendState('connected');
      recordSessionEvent({ type: 'session.backend.health.succeeded' });
      return true;
    } catch (error) {
      if (operationId && !isCurrentSessionOperation(operationId)) {
        return false;
      }

      const detail = asErrorDetail(error, 'Backend health check failed');
      store.setBackendState('failed');
      store.setLastRuntimeError(detail);
      textChatCtrl.applyLifecycleEvent({ type: 'runtime.failed' });
      recordSessionEvent({ type: 'session.backend.health.failed', detail });
      return false;
    }
  };

  const hasSpeechRuntimeActivity = (): boolean => {
    const store = dependencies.store.getState();

    return (
      isSpeechLifecycleActive(store.speechLifecycle.status) ||
      (
        store.voiceSessionStatus !== 'disconnected' &&
        store.voiceSessionStatus !== 'error'
      ) ||
      (
        store.voiceCaptureState !== 'idle' &&
        store.voiceCaptureState !== 'stopped' &&
        store.voiceCaptureState !== 'error'
      ) ||
      (
        store.voicePlaybackState !== 'idle' &&
        store.voicePlaybackState !== 'stopped' &&
        store.voicePlaybackState !== 'error'
      ) ||
      (
        store.screenCaptureState !== 'disabled' &&
        store.screenCaptureState !== 'error'
      ) ||
      activeTransport?.kind === LIVE_ADAPTER_KEY
    );
  };

  const teardownActiveRuntime = async (
    {
      textSessionStatus = 'disconnected',
      preserveLastRuntimeError = null,
      preserveVoiceRuntimeDiagnostics = false,
    }: {
      textSessionStatus?: TextSessionStatus;
      preserveLastRuntimeError?: string | null;
      preserveVoiceRuntimeDiagnostics?: boolean;
    } = {},
  ): Promise<void> => {
    const store = dependencies.store.getState();
    const preservedVoiceSessionResumption = preserveVoiceRuntimeDiagnostics
      ? store.voiceSessionResumption
      : null;
    const preservedVoiceSessionDurability = preserveVoiceRuntimeDiagnostics
      ? store.voiceSessionDurability
      : null;
    const preservedVoiceToolState = preserveVoiceRuntimeDiagnostics
      ? store.voiceToolState
      : null;
    const hasActiveRuntime =
      activeTransport !== null ||
      textChatCtrl.hasActiveStream() ||
      voiceChunkCtrl.hasCapture() ||
      playbackCtrl.isActive() ||
      screenCtrl.isActive() ||
      hasSpeechRuntimeActivity() ||
      textChatCtrl.hasRuntimeActivity();

    if (!hasActiveRuntime) {
      if (isSpeechLifecycleActive(currentSpeechLifecycleStatus())) {
        applySpeechLifecycleEvent({ type: 'session.end.requested' });
        applySpeechLifecycleEvent({ type: 'session.ended' });
      }
      resetRuntimeState(textSessionStatus);
      store.setVoiceSessionStatus('disconnected');
      store.setAssistantActivity('idle');
      tokenMgr.clear();
      voiceResumptionInFlight = false;
      if (preserveVoiceRuntimeDiagnostics) {
        if (preservedVoiceSessionResumption) {
          store.setVoiceSessionResumption(preservedVoiceSessionResumption);
        }
        if (preservedVoiceSessionDurability) {
          store.setVoiceSessionDurability(preservedVoiceSessionDurability);
        }
        if (preservedVoiceToolState) {
          store.setVoiceToolState(preservedVoiceToolState);
        }
      } else {
        resetVoiceSessionResumption();
        resetVoiceSessionDurability();
        resetVoiceToolState();
      }
      clearCurrentVoiceTranscript();
      if (preserveLastRuntimeError !== null) {
        store.setLastRuntimeError(preserveLastRuntimeError);
      }
      return;
    }

    if (textChatCtrl.hasActiveStream() || isSessionActiveLifecycle(textChatCtrl.currentStatus())) {
      textChatCtrl.applyLifecycleEvent({ type: 'disconnect.requested' });
    }

    if (hasSpeechRuntimeActivity()) {
      applySpeechLifecycleEvent({ type: 'session.end.requested' });
      store.setVoiceSessionStatus('stopping');
    }

    try {
      if (
        voiceChunkCtrl.hasCapture() &&
        (
          store.voiceCaptureState === 'capturing' ||
          store.voiceCaptureState === 'requestingPermission' ||
          store.voiceCaptureState === 'stopping'
        )
      ) {
        await voiceChunkCtrl.flush();
        await voiceChunkCtrl.getVoiceCapture().stop();
      }

      stopScreenCaptureInternal();
      await activeTransport?.disconnect();
      await stopVoicePlayback();
    } finally {
      applySpeechLifecycleEvent({ type: 'session.ended' });
      cleanupTransport();
      resetRuntimeState(textSessionStatus);
      tokenMgr.clear();
      voiceResumptionInFlight = false;
      if (preserveVoiceRuntimeDiagnostics) {
        if (preservedVoiceSessionResumption) {
          store.setVoiceSessionResumption(preservedVoiceSessionResumption);
        }
        if (preservedVoiceSessionDurability) {
          store.setVoiceSessionDurability(preservedVoiceSessionDurability);
        }
        if (preservedVoiceToolState) {
          store.setVoiceToolState(preservedVoiceToolState);
        }
      } else {
        resetVoiceSessionResumption();
        resetVoiceSessionDurability();
        resetVoiceToolState();
      }
      clearCurrentVoiceTranscript();
      store.setVoiceCaptureState(voiceChunkCtrl.hasCapture() ? 'stopped' : 'idle');
      store.setVoicePlaybackState('stopped');
      store.setVoiceSessionStatus('disconnected');
      store.setAssistantActivity('idle');
      if (preserveLastRuntimeError !== null) {
        store.setLastRuntimeError(preserveLastRuntimeError);
      }
    }
  };

  const endSessionInternal = async (
    options: {
      preserveLastRuntimeError?: string | null;
      recordEvents?: boolean;
      preserveVoiceRuntimeDiagnostics?: boolean;
    } = {},
  ): Promise<void> => {
    const {
      preserveLastRuntimeError = null,
      recordEvents = false,
      preserveVoiceRuntimeDiagnostics = false,
    } = options;

    beginSessionOperation();

    if (recordEvents) {
      recordSessionEvent({ type: 'session.end.requested' });
    }

    await teardownActiveRuntime({
      textSessionStatus: 'disconnected',
      preserveLastRuntimeError,
      preserveVoiceRuntimeDiagnostics,
    });
    setCurrentMode('text');

    if (recordEvents) {
      recordSessionEvent({ type: 'session.ended' });
    }
  };

  const ensureExclusiveMode = async (
    targetMode: ProductMode,
    operationId: number,
  ): Promise<void> => {
    const shouldTearDownSpeech =
      targetMode === 'text' &&
      (currentProductMode() !== 'text' || hasSpeechRuntimeActivity());
    const shouldTearDownText =
      targetMode === 'speech' &&
      (currentProductMode() !== 'speech' || textChatCtrl.hasRuntimeActivity());

    if (shouldTearDownSpeech || shouldTearDownText) {
      await teardownActiveRuntime({
        textSessionStatus: 'disconnected',
      });

      if (!isCurrentSessionOperation(operationId)) {
        return;
      }
    }

    setCurrentMode(targetMode);
  };

  return {
    checkBackendHealth: async () => {
      await performBackendHealthCheck();
    },
    startSession: async ({ mode }) => {
      await startSessionInternal({ mode });
    },
    startVoiceCapture: async () => {
      await voiceChunkCtrl.startCapture();
    },
    stopVoiceCapture: async () => {
      const store = dependencies.store.getState();

      if (
        store.voiceCaptureState === 'idle' ||
        store.voiceCaptureState === 'stopped'
      ) {
        return;
      }

      store.setVoiceCaptureState('stopping');
      store.setVoiceSessionStatus('stopping');

      try {
        await voiceChunkCtrl.flush();
        await voiceChunkCtrl.getVoiceCapture().stop();
      } finally {
        dependencies.store.getState().setVoiceCaptureState('stopped');
        dependencies.store
          .getState()
          .setVoiceSessionStatus(activeTransport ? 'ready' : 'disconnected');
      }
    },
    startScreenCapture: () => {
      return screenCtrl.start();
    },
    stopScreenCapture: () => {
      return screenCtrl.stop();
    },
    subscribeToVoiceChunks: (listener) => {
      return voiceChunkCtrl.addChunkListener(listener);
    },
    submitTextTurn: async (text: string) => {
      const trimmedText = text.trim();

      if (!trimmedText) {
        return false;
      }

      if (isSpeechLifecycleActive(currentSpeechLifecycleStatus())) {
        if (!activeTransport || activeTransport.kind !== LIVE_ADAPTER_KEY) {
          logRuntimeError('voice-session', 'submit aborted because voice transport is unavailable', {
            textLength: trimmedText.length,
          });
          return false;
        }

        try {
          textChatCtrl.appendUserTurn(trimmedText);
          dependencies.store.getState().setLastRuntimeError(null);
          await activeTransport.sendText(trimmedText);
          syncSpeechSilenceTimeout(currentSpeechLifecycleStatus());
          return true;
        } catch (error) {
          const detail = asErrorDetail(error, 'Failed to send speech-mode text turn');
          dependencies.store.getState().setLastRuntimeError(detail);
          setVoiceErrorState(detail);
          return false;
        }
      }

      return textChatCtrl.submitTurn(trimmedText);
    },
    endSession: async () => {
      await endSessionInternal({ recordEvents: true });
    },
    setAssistantState: (assistantState: DebugAssistantState) => {
      dependencies.store.getState().setAssistantState(assistantState);
      recordSessionEvent({
        type: 'session.debug.state.set',
        detail: assistantState,
      });
    },
  };
}

let desktopSessionController: DesktopSessionController | null = null;

export function getDesktopSessionController(): DesktopSessionController {
  if (!desktopSessionController) {
    desktopSessionController = createDesktopSessionController();
  }

  return desktopSessionController;
}

export function resetDesktopSessionController(): void {
  desktopSessionController = null;
}
