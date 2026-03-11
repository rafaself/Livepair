import { checkBackendHealth, requestSessionToken, startTextChatStream } from '../api/backend';
import { useSessionStore } from '../store/sessionStore';
import { useSettingsStore } from '../store/settingsStore';
import {
  defaultRuntimeLogger,
  logLifecycleTransition,
  logRuntimeDiagnostic,
  logRuntimeError,
} from './core/logger';
import { createGeminiLiveTransport } from './transport/geminiLiveTransport';
import { LIVE_ADAPTER_KEY } from './transport/liveConfig';
import { createAssistantAudioPlayback } from './audio/assistantAudioPlayback';
import { createLocalVoiceCapture } from './audio/localVoiceCapture';
import { createLocalScreenCapture } from './screen/localScreenCapture';
import {
  isSpeechLifecycleActive,
  type SpeechSessionLifecycleEvent,
} from './speech/speechSessionLifecycle';
import { createVoiceTranscriptController } from './voice/voiceTranscriptController';
import { createVoicePlaybackController } from './voice/voicePlaybackController';
import { createScreenCaptureController } from './screen/screenCaptureController';
import { createVoiceToolController } from './voice/voiceToolController';
import { createVoiceInterruptionController } from './voice/voiceInterruptionController';
import { createVoiceTokenManager } from './voice/voiceTokenManager';
import { createSpeechSilenceController } from './speech/speechSilenceController';
import { createConversationContext } from './conversation/conversationTurnManager';
import { createTextChatController } from './text/textChatController';
import { createTransportEventRouter } from './transport/transportEventRouter';
import { createVoiceChunkPipeline } from './voice/voiceChunkPipeline';
import { createVoiceResumeController } from './voice/voiceResumeController';
import { createSessionControllerErrorHandling } from './sessionControllerErrorHandling';
import { createSessionControllerLifecycle } from './sessionControllerLifecycle';
import { createSessionControllerModeSwitching } from './sessionControllerModeSwitching';
import { createSessionControllerTeardown } from './sessionControllerTeardown';
import { asErrorDetail, createDebugEvent } from './core/runtimeUtils';
import { createSessionControllerStateSync } from './sessionControllerStateSync';
import type {
  SessionControllerEvent,
  SessionMode,
  ProductMode,
} from './core/session.types';
import type {
  DesktopSession,
} from './transport/transport.types';
import type {
  SpeechLifecycleStatus,
} from './speech/speech.types';
import type {
  TextSessionStatus,
} from './text/text.types';
import type {
  VoiceSessionDurabilityState,
  VoiceSessionStatus,
  VoicePlaybackDiagnostics,
  VoicePlaybackState,
  VoiceToolCall,
} from './voice/voice.types';
import type {
  CreateEphemeralTokenResponse,
} from '@livepair/shared-types';
import type {
  DesktopSessionController,
  DesktopSessionControllerDependencies,
  DebugAssistantState,
} from './core/sessionControllerTypes';

export type {
  DesktopSessionController,
  DesktopSessionControllerDependencies,
} from './core/sessionControllerTypes';


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
  let performBackendHealthCheck = async (_operationId?: number): Promise<boolean> => {
    throw new Error('performBackendHealthCheck called before initialization');
  };
  let startSessionInternal = async (_options: { mode: SessionMode }): Promise<void> => {
    throw new Error('startSessionInternal called before initialization');
  };
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
  let setErrorState = (
    _detail: string,
    _failedTurnStatusLabel = 'Disconnected',
  ): void => {
    throw new Error('setErrorState called before initialization');
  };
  let setVoiceErrorState = (_detail: string): void => {
    throw new Error('setVoiceErrorState called before initialization');
  };
  const voiceToolCtrl = createVoiceToolController(
    dependencies.store,
    () => activeTransport,
    () => stateSync.createVoiceToolExecutionSnapshot(),
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
  const stateSync = createSessionControllerStateSync({
    store: dependencies.store,
    settingsStore: dependencies.settingsStore,
    onSpeechLifecycleTransition: (previousStatus, nextStatus, eventType) => {
      logLifecycleTransition(previousStatus, nextStatus, eventType);
    },
    handleSpeechLifecycleStatusChange: (status) => {
      silenceCtrl.handleStatusChange(status);
    },
    updateVoicePlaybackDiagnostics: (patch) => {
      playbackCtrl.updateDiagnostics(patch);
    },
    setVoicePlaybackState: (state) => {
      playbackCtrl.setState(state);
    },
    getVoicePlayback: () => playbackCtrl.getOrCreate(),
    setVoiceToolState: (patch) => {
      voiceToolCtrl.setState(patch);
    },
    resetVoiceToolState: () => {
      voiceToolCtrl.reset();
    },
    clearCurrentVoiceTranscript: () => {
      voiceTranscript.clearTranscript();
    },
    resetVoiceTurnTranscriptState: () => {
      voiceTranscript.resetTurnTranscriptState();
    },
    applyVoiceTranscriptUpdate: (role, text, isFinal) => {
      voiceTranscript.applyTranscriptUpdate(role, text, isFinal);
    },
    syncVoiceDurabilityState: (token, patch) => {
      tokenMgr.syncDurabilityState(token, patch);
    },
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
    stateSync.updateVoicePlaybackDiagnostics(patch);
  };

  const setVoicePlaybackState = (state: VoicePlaybackState): void => {
    stateSync.setVoicePlaybackState(state);
  };

  const getVoicePlayback = () => stateSync.getVoicePlayback();

  const currentSpeechLifecycleStatus = (): SpeechLifecycleStatus => {
    return stateSync.currentSpeechLifecycleStatus();
  };

  const syncSpeechSilenceTimeout = (status: SpeechLifecycleStatus): void => {
    silenceCtrl.syncTimeout(status);
  };

  const applySpeechLifecycleEvent = (
    event: SpeechSessionLifecycleEvent,
  ): SpeechLifecycleStatus => {
    return stateSync.applySpeechLifecycleEvent(event);
  };

  const currentVoiceSessionStatus = (): VoiceSessionStatus => {
    return stateSync.currentVoiceSessionStatus();
  };

  const currentProductMode = () => stateSync.currentProductMode();

  const setCurrentMode = (mode: ReturnType<typeof stateSync.resolveProductMode>): void => {
    stateSync.setCurrentMode(mode);
  };

  const resolveProductMode = (mode: SessionMode) => stateSync.resolveProductMode(mode);

  const setVoiceSessionStatus = (status: VoiceSessionStatus): void => {
    stateSync.setVoiceSessionStatus(status);
  };

  const setVoiceSessionResumption = (
    patch: Parameters<typeof stateSync.setVoiceSessionResumption>[0],
  ): void => {
    stateSync.setVoiceSessionResumption(patch);
  };

  const resetVoiceSessionResumption = (): void => {
    stateSync.resetVoiceSessionResumption();
  };

  const setVoiceSessionDurability = (
    patch: Partial<VoiceSessionDurabilityState>,
  ): void => {
    stateSync.setVoiceSessionDurability(patch);
  };

  const resetVoiceSessionDurability = (): void => {
    stateSync.resetVoiceSessionDurability();
  };

  const setVoiceToolState = (patch: Parameters<typeof stateSync.setVoiceToolState>[0]): void => {
    stateSync.setVoiceToolState(patch);
  };

  const resetVoiceToolState = (): void => {
    stateSync.resetVoiceToolState();
  };

  const clearCurrentVoiceTranscript = (): void => {
    stateSync.clearCurrentVoiceTranscript();
  };

  const resetVoiceTurnTranscriptState = (): void => {
    stateSync.resetVoiceTurnTranscriptState();
  };

  const applyVoiceTranscriptUpdate = (
    role: 'user' | 'assistant',
    text: string,
    isFinal?: boolean,
  ): void => {
    stateSync.applyVoiceTranscriptUpdate(role, text, isFinal);
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

  const syncVoiceDurabilityState = (
    token: CreateEphemeralTokenResponse | null,
    patch: Partial<VoiceSessionDurabilityState> = {},
  ): void => {
    stateSync.syncVoiceDurabilityState(token, patch);
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
  const teardown = createSessionControllerTeardown({
    store: dependencies.store,
    currentSpeechLifecycleStatus: () => currentSpeechLifecycleStatus(),
    currentTextSessionStatus: () => textChatCtrl.currentStatus(),
    applySpeechLifecycleEvent: (event) => {
      applySpeechLifecycleEvent(event as SpeechSessionLifecycleEvent);
    },
    clearToken: () => {
      tokenMgr.clear();
    },
    clearCurrentVoiceTranscript: () => clearCurrentVoiceTranscript(),
    cleanupTransport: () => cleanupTransport(),
    getActiveTransport: () => activeTransport,
    getVoiceCapture: () => voiceChunkCtrl.getVoiceCapture(),
    hasActiveTextStream: () => textChatCtrl.hasActiveStream(),
    hasScreenCapture: () => screenCtrl.isActive(),
    hasTextRuntimeActivity: () => textChatCtrl.hasRuntimeActivity(),
    hasVoiceCapture: () => voiceChunkCtrl.hasCapture(),
    hasVoicePlayback: () => playbackCtrl.isActive(),
    resetRuntimeState: (textSessionStatus) => resetRuntimeState(textSessionStatus),
    resetVoiceSessionDurability: () => resetVoiceSessionDurability(),
    resetVoiceSessionResumption: () => resetVoiceSessionResumption(),
    resetVoiceToolState: () => resetVoiceToolState(),
    setVoiceCaptureState: (state) => {
      dependencies.store.getState().setVoiceCaptureState(state);
    },
    setVoicePlaybackState: (state) => {
      dependencies.store.getState().setVoicePlaybackState(state);
    },
    setVoiceResumptionInFlight: (value) => {
      voiceResumptionInFlight = value;
    },
    setVoiceSessionDurability: (value) => {
      dependencies.store.getState().setVoiceSessionDurability(value);
    },
    setVoiceSessionResumption: (value) => {
      dependencies.store.getState().setVoiceSessionResumption(value);
    },
    setVoiceSessionStatus: (status) => {
      dependencies.store.getState().setVoiceSessionStatus(status);
    },
    setVoiceToolStateSnapshot: (value) => {
      dependencies.store.getState().setVoiceToolState(value);
    },
    stopScreenCaptureInternal: () => {
      stopScreenCaptureInternal();
    },
    stopVoiceCapture: async () => {
      await voiceChunkCtrl.flush();
    },
    stopVoicePlayback: () => stopVoicePlayback(),
    textDisconnectRequested: () => {
      textChatCtrl.applyLifecycleEvent({ type: 'disconnect.requested' });
    },
  });

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

  const lifecycle = createSessionControllerLifecycle({
    store: dependencies.store,
    beginSessionOperation: () => beginSessionOperation(),
    isCurrentSessionOperation: (operationId) => isCurrentSessionOperation(operationId),
    ensureExclusiveMode: (targetMode, operationId) => ensureExclusiveMode(targetMode, operationId),
    resolveProductMode: (mode) => resolveProductMode(mode),
    currentProductMode: () => currentProductMode(),
    currentVoiceSessionStatus: () => currentVoiceSessionStatus(),
    currentTextSessionStatus: () => textChatCtrl.currentStatus(),
    hasSpeechRuntimeActivity: () => hasSpeechRuntimeActivity(),
    resetRuntimeState: (textSessionStatus) => resetRuntimeState(textSessionStatus),
    recordSessionEvent: (event) => recordSessionEvent(event),
    applySpeechLifecycleEvent: (event) => {
      applySpeechLifecycleEvent(event as SpeechSessionLifecycleEvent);
    },
    setVoiceCaptureState: (state) => {
      dependencies.store.getState().setVoiceCaptureState(state);
    },
    setVoiceCaptureDiagnostics: (patch) => {
      dependencies.store.getState().setVoiceCaptureDiagnostics(patch);
    },
    setVoicePlaybackState: (state) => {
      setVoicePlaybackState(state);
    },
    updateVoicePlaybackDiagnostics: (patch) => {
      updateVoicePlaybackDiagnostics(patch);
    },
    selectedOutputDeviceId: () => stateSync.selectedOutputDeviceId(),
    setVoiceSessionStatus: (status) => {
      setVoiceSessionStatus(status);
    },
    resetVoiceSessionResumption: () => resetVoiceSessionResumption(),
    resetVoiceSessionDurability: () => resetVoiceSessionDurability(),
    resetVoiceToolState: () => resetVoiceToolState(),
    requestVoiceSessionToken: (operationId) => requestVoiceSessionToken(operationId),
    setCachedVoiceToken: (token) => {
      tokenMgr.set(token);
    },
    syncVoiceDurabilityState: (token, patch) => syncVoiceDurabilityState(token, patch),
    setVoiceResumptionInFlight: (value) => {
      voiceResumptionInFlight = value;
    },
    createTransport: () => dependencies.createTransport(LIVE_ADAPTER_KEY),
    activateVoiceTransport: (transport) => {
      cleanupTransport();
      activeTransport = transport;
      unsubscribeTransport = transport.subscribe(handleTransportEvent);
    },
    startVoiceCapture: () => voiceChunkCtrl.startCapture({ shutdownOnFailure: true }),
    setVoiceErrorState: (detail) => {
      setVoiceErrorState(detail);
    },
    checkBackendHealth: () => dependencies.checkBackendHealth(),
    textBootstrapStarted: () => {
      textChatCtrl.applyLifecycleEvent({ type: 'bootstrap.started' });
    },
    textRuntimeFailed: () => {
      textChatCtrl.applyLifecycleEvent({ type: 'runtime.failed' });
    },
    textTransportConnected: () => {
      textChatCtrl.applyLifecycleEvent({ type: 'transport.connected' });
    },
    textAdapterKey: textChatCtrl.TEXT_CHAT_ADAPTER_KEY,
    logRuntimeDiagnostic,
  });
  performBackendHealthCheck = lifecycle.performBackendHealthCheck;
  startSessionInternal = lifecycle.startSessionInternal;

  const hasSpeechRuntimeActivity = (): boolean => teardown.hasSpeechRuntimeActivity();

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
    await teardown.teardownActiveRuntime({
      textSessionStatus,
      preserveLastRuntimeError,
      preserveVoiceRuntimeDiagnostics,
    });
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
  ({ setErrorState, setVoiceErrorState } = createSessionControllerErrorHandling({
    clearToken: () => {
      tokenMgr.clear();
    },
    cleanupTransport: () => cleanupTransport(),
    endSessionInternal: (options) => endSessionInternal(options),
    logRuntimeError,
    resetVoiceTurnTranscriptState: () => resetVoiceTurnTranscriptState(),
    setLastRuntimeError: (detail) => {
      dependencies.store.getState().setLastRuntimeError(detail);
    },
    setAssistantActivity: (activity) => {
      dependencies.store.getState().setAssistantActivity(activity);
    },
    setActiveTransport: (transport) => {
      dependencies.store.getState().setActiveTransport(transport);
    },
    setCurrentMode: (mode) => {
      dependencies.store.getState().setCurrentMode(mode);
    },
    setVoiceResumptionInFlight: (value) => {
      voiceResumptionInFlight = value;
    },
    getVoiceSessionResumptionStatus: () =>
      dependencies.store.getState().voiceSessionResumption.status,
    setVoiceSessionResumption: (patch) => {
      setVoiceSessionResumption(patch);
    },
    setVoiceSessionStatus: (status) => {
      dependencies.store.getState().setVoiceSessionStatus(status);
    },
    setVoiceToolState: (patch) => {
      setVoiceToolState(patch);
    },
    textRuntimeFailed: () => {
      textChatCtrl.applyLifecycleEvent({ type: 'runtime.failed' });
    },
    failPendingAssistantTurn: (statusLabel) => {
      textChatCtrl.failPendingAssistantTurn(statusLabel);
    },
  }));
  const modeSwitching = createSessionControllerModeSwitching({
    currentProductMode: () => currentProductMode(),
    hasSpeechRuntimeActivity: () => hasSpeechRuntimeActivity(),
    hasTextRuntimeActivity: () => textChatCtrl.hasRuntimeActivity(),
    isCurrentSessionOperation: (operationId) => isCurrentSessionOperation(operationId),
    setCurrentMode: (mode) => {
      setCurrentMode(mode);
    },
    teardownActiveRuntime: (options) => teardownActiveRuntime(options),
  });

  const ensureExclusiveMode = async (
    targetMode: ProductMode,
    operationId: number,
  ): Promise<void> => {
    await modeSwitching.ensureExclusiveMode(targetMode, operationId);
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
