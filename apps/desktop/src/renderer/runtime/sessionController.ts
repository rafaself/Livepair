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
import { type SpeechSessionLifecycleEvent } from './speech/speechSessionLifecycle';
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
import { createSessionControllerStateSync } from './sessionControllerStateSync';
import { createSessionControllerMutableRuntime } from './sessionControllerMutableRuntime';
import { createSessionControllerRuntime } from './sessionControllerRuntime';
import { createSessionControllerPublicApi } from './sessionControllerPublicApi';
import type {
  SessionMode,
  ProductMode,
} from './core/session.types';
import type {
  TextSessionStatus,
} from './text/text.types';
import type {
  CreateEphemeralTokenResponse,
} from '@livepair/shared-types';
import type {
  DesktopSessionController,
  DesktopSessionControllerDependencies,
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

  const mutableRuntime = createSessionControllerMutableRuntime();
  const conversationCtx = createConversationContext(dependencies.store);
  let performBackendHealthCheck = async (_operationId?: number): Promise<boolean> => {
    throw new Error('performBackendHealthCheck called before initialization');
  };
  let startSessionInternal = async (_options: { mode: SessionMode }): Promise<void> => {
    throw new Error('startSessionInternal called before initialization');
  };
  let endSessionInternal = async (
    _options: {
      preserveLastRuntimeError?: string | null;
      recordEvents?: boolean;
      preserveVoiceRuntimeDiagnostics?: boolean;
    } = {},
  ): Promise<void> => {
    throw new Error('endSessionInternal called before initialization');
  };
  const runtimeRef = {
    current: null as ReturnType<typeof createSessionControllerRuntime> | null,
  };
  const playbackCtrl = createVoicePlaybackController(
    dependencies.store,
    dependencies.settingsStore,
    dependencies.createVoicePlayback,
  );
  const screenCtrl = createScreenCaptureController(
    dependencies.store,
    dependencies.createScreenCapture,
    () => mutableRuntime.getActiveTransport(),
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
  let settleVoiceErrorState = async (_detail: string): Promise<void> => {
    throw new Error('settleVoiceErrorState called before initialization');
  };
  const voiceToolCtrl = createVoiceToolController(
    dependencies.store,
    () => mutableRuntime.getActiveTransport(),
    () => stateSync.createVoiceToolExecutionSnapshot(),
  );
  const interruptionCtrl = createVoiceInterruptionController(
    dependencies.store,
    () => mutableRuntime.getActiveTransport(),
    () => runtimeRef.current!.currentVoiceSessionStatus(),
    (status) => runtimeRef.current!.setVoiceSessionStatus(status),
    (event) => runtimeRef.current!.applySpeechLifecycleEvent(event),
    () => runtimeRef.current!.stopVoicePlayback(),
  );
  const voiceTranscript = createVoiceTranscriptController(dependencies.store);
  const tokenMgr = createVoiceTokenManager(
    dependencies.store,
    dependencies.requestSessionToken,
    (id) => runtimeRef.current!.isCurrentSessionOperation(id),
    (patch) => runtimeRef.current!.setVoiceSessionDurability(patch),
    (event) => runtimeRef.current!.recordSessionEvent(event),
    (detail) => setVoiceErrorState(detail),
    LIVE_ADAPTER_KEY,
  );
  const silenceCtrl = createSpeechSilenceController(
    dependencies.settingsStore,
    () => void endSessionInternal(),
    () => runtimeRef.current!.applySpeechLifecycleEvent({ type: 'recovery.completed' }),
  );
  const voiceChunkCtrl = createVoiceChunkPipeline({
    store: dependencies.store,
    settingsStore: dependencies.settingsStore,
    createVoiceCapture: dependencies.createVoiceCapture,
    getActiveTransport: () => mutableRuntime.getActiveTransport(),
    currentVoiceSessionStatus: () => runtimeRef.current!.currentVoiceSessionStatus(),
    setVoiceSessionStatus: (s) => runtimeRef.current!.setVoiceSessionStatus(s),
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
  runtimeRef.current = createSessionControllerRuntime({
    logger: dependencies.logger,
    store: dependencies.store,
    mutableRuntime,
    stateSync,
    playbackCtrl,
    voiceChunkCtrl,
    voiceToolCtrl,
    screenCtrl,
    interruptionCtrl,
    textChatCtrl,
    voiceTranscript,
    silenceCtrl,
  });
  const transportRouter = createTransportEventRouter({
    store: dependencies.store,
    settingsStore: dependencies.settingsStore,
    logger: dependencies.logger,
    logRuntimeDiagnostic,
    isVoiceResumptionInFlight: () => runtimeRef.current!.getVoiceResumptionInFlight(),
    setVoiceResumptionInFlight: (v) => {
      runtimeRef.current!.setVoiceResumptionInFlight(v);
    },
    currentVoiceSessionStatus: () => runtimeRef.current!.currentVoiceSessionStatus(),
    currentSpeechLifecycleStatus: () => runtimeRef.current!.currentSpeechLifecycleStatus(),
    getToken: () => tokenMgr.get(),
    setVoiceSessionStatus: (s) => runtimeRef.current!.setVoiceSessionStatus(s),
    setVoiceSessionResumption: (p) => runtimeRef.current!.setVoiceSessionResumption(p),
    setVoiceSessionDurability: (p) => runtimeRef.current!.setVoiceSessionDurability(p),
    syncVoiceDurabilityState: (t, p) => runtimeRef.current!.syncVoiceDurabilityState(t, p),
    setVoicePlaybackState: (s) => runtimeRef.current!.setVoicePlaybackState(s),
    updateVoicePlaybackDiagnostics: (p) => runtimeRef.current!.updateVoicePlaybackDiagnostics(p),
    getVoicePlayback: () => runtimeRef.current!.getVoicePlayback(),
    stopVoicePlayback: (s) => runtimeRef.current!.stopVoicePlayback(s),
    cancelVoiceToolCalls: (detail) => {
      voiceToolCtrl.cancel(detail);
    },
    resetVoiceToolState: () => runtimeRef.current!.resetVoiceToolState(),
    resetVoiceTurnTranscriptState: () => runtimeRef.current!.resetVoiceTurnTranscriptState(),
    markTurnCompleted: () => voiceTranscript.markTurnCompleted(),
    promoteAssistantTranscriptTurn: (finalizeReason) => {
      const content = voiceTranscript.consumePromotableAssistantTranscript(finalizeReason);

      if (!content) {
        return;
      }

      textChatCtrl.appendCompletedAssistantTurn(
        content,
        finalizeReason === 'interrupted' ? 'Interrupted' : undefined,
      );
    },
    enqueueVoiceToolCalls: (c) => runtimeRef.current!.enqueueVoiceToolCalls(c),
    handleVoiceInterruption: () => runtimeRef.current!.handleVoiceInterruption(),
    applySpeechLifecycleEvent: (e) => runtimeRef.current!.applySpeechLifecycleEvent(e),
    applyVoiceTranscriptUpdate: (r, t, f) => runtimeRef.current!.applyVoiceTranscriptUpdate(r, t, f),
    setVoiceErrorState: (d) => setVoiceErrorState(d),
    cleanupTransport: () => runtimeRef.current!.cleanupTransport(),
    resumeVoiceSession: (d) => voiceResumeCtrl.resume(d),
  });
  const voiceResumeCtrl = createVoiceResumeController({
    store: dependencies.store,
    createTransport: dependencies.createTransport,
    getToken: () => tokenMgr.get(),
    beginSessionOperation: () => runtimeRef.current!.beginSessionOperation(),
    isCurrentSessionOperation: (id) => runtimeRef.current!.isCurrentSessionOperation(id),
    logRuntimeDiagnostic,
    setVoiceSessionStatus: (s) => runtimeRef.current!.setVoiceSessionStatus(s),
    setVoiceSessionResumption: (p) => runtimeRef.current!.setVoiceSessionResumption(p),
    setVoiceSessionDurability: (p) => runtimeRef.current!.setVoiceSessionDurability(p),
    setVoiceErrorState: (d) => setVoiceErrorState(d),
    setVoiceResumptionInFlight: (v) => {
      runtimeRef.current!.setVoiceResumptionInFlight(v);
    },
    refreshToken: (id, d) => refreshVoiceSessionToken(id, d),
    stopVoicePlayback: () => runtimeRef.current!.stopVoicePlayback(),
    subscribeTransport: (t, h) => {
      runtimeRef.current!.subscribeTransport(t, h);
    },
    handleTransportEvent: (e) => handleTransportEvent(e),
    getActiveTransport: () => runtimeRef.current!.getActiveTransport(),
    setActiveTransport: (t) => {
      runtimeRef.current!.setActiveTransport(t);
    },
    unsubscribePreviousTransport: () => {
      mutableRuntime.clearTransportSubscription();
    },
    resetTransportDeps: () => {
      voiceChunkCtrl.resetSendChain();
      voiceToolCtrl.cancel('voice transport replaced');
      screenCtrl.resetSendChain();
      interruptionCtrl.reset();
      textChatCtrl.clearPendingAssistantTurn();
      voiceTranscript.resetTurnCompletedFlag();
    },
  });
  const teardown = createSessionControllerTeardown({
    store: dependencies.store,
    currentSpeechLifecycleStatus: () => runtimeRef.current!.currentSpeechLifecycleStatus(),
    currentTextSessionStatus: () => textChatCtrl.currentStatus(),
    applySpeechLifecycleEvent: (event) => {
      runtimeRef.current!.applySpeechLifecycleEvent(event as SpeechSessionLifecycleEvent);
    },
    clearToken: () => {
      tokenMgr.clear();
    },
    clearCurrentVoiceTranscript: () => runtimeRef.current!.clearCurrentVoiceTranscript(),
    cleanupTransport: () => runtimeRef.current!.cleanupTransport(),
    getActiveTransport: () => runtimeRef.current!.getActiveTransport(),
    getVoiceCapture: () => voiceChunkCtrl.getVoiceCapture(),
    hasActiveTextStream: () => textChatCtrl.hasActiveStream(),
    hasScreenCapture: () => screenCtrl.isActive(),
    hasTextRuntimeActivity: () => textChatCtrl.hasRuntimeActivity(),
    hasVoiceCapture: () => voiceChunkCtrl.hasCapture(),
    hasVoicePlayback: () => playbackCtrl.isActive(),
    resetRuntimeState: (textSessionStatus) => runtimeRef.current!.resetRuntimeState(textSessionStatus),
    resetVoiceSessionDurability: () => runtimeRef.current!.resetVoiceSessionDurability(),
    resetVoiceSessionResumption: () => runtimeRef.current!.resetVoiceSessionResumption(),
    resetVoiceToolState: () => runtimeRef.current!.resetVoiceToolState(),
    setVoiceCaptureState: (state) => {
      dependencies.store.getState().setVoiceCaptureState(state);
    },
    setVoicePlaybackState: (state) => {
      dependencies.store.getState().setVoicePlaybackState(state);
    },
    setVoiceResumptionInFlight: (value) => {
      runtimeRef.current!.setVoiceResumptionInFlight(value);
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
    stopScreenCaptureInternal: () => runtimeRef.current!.stopScreenCaptureInternal(),
    stopVoiceCapture: async () => {
      await voiceChunkCtrl.flush();
    },
    stopVoicePlayback: () => runtimeRef.current!.stopVoicePlayback(),
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
    beginSessionOperation: () => runtimeRef.current!.beginSessionOperation(),
    isCurrentSessionOperation: (operationId) => runtimeRef.current!.isCurrentSessionOperation(operationId),
    ensureExclusiveMode: (targetMode, operationId) => ensureExclusiveMode(targetMode, operationId),
    resolveProductMode: (mode) => runtimeRef.current!.resolveProductMode(mode),
    currentProductMode: () => runtimeRef.current!.currentProductMode(),
    currentVoiceSessionStatus: () => runtimeRef.current!.currentVoiceSessionStatus(),
    currentTextSessionStatus: () => textChatCtrl.currentStatus(),
    hasSpeechRuntimeActivity: () => hasSpeechRuntimeActivity(),
    resetRuntimeState: (textSessionStatus) => runtimeRef.current!.resetRuntimeState(textSessionStatus),
    recordSessionEvent: (event) => runtimeRef.current!.recordSessionEvent(event),
    applySpeechLifecycleEvent: (event) => {
      runtimeRef.current!.applySpeechLifecycleEvent(event as SpeechSessionLifecycleEvent);
    },
    setVoiceCaptureState: (state) => {
      dependencies.store.getState().setVoiceCaptureState(state);
    },
    setVoiceCaptureDiagnostics: (patch) => {
      dependencies.store.getState().setVoiceCaptureDiagnostics(patch);
    },
    setVoicePlaybackState: (state) => {
      runtimeRef.current!.setVoicePlaybackState(state);
    },
    updateVoicePlaybackDiagnostics: (patch) => {
      runtimeRef.current!.updateVoicePlaybackDiagnostics(patch);
    },
    selectedOutputDeviceId: () => stateSync.selectedOutputDeviceId(),
    setVoiceSessionStatus: (status) => {
      runtimeRef.current!.setVoiceSessionStatus(status);
    },
    resetVoiceSessionResumption: () => runtimeRef.current!.resetVoiceSessionResumption(),
    resetVoiceSessionDurability: () => runtimeRef.current!.resetVoiceSessionDurability(),
    resetVoiceToolState: () => runtimeRef.current!.resetVoiceToolState(),
    requestVoiceSessionToken: (operationId) => requestVoiceSessionToken(operationId),
    setCachedVoiceToken: (token) => {
      tokenMgr.set(token);
    },
    syncVoiceDurabilityState: (token, patch) => runtimeRef.current!.syncVoiceDurabilityState(token, patch),
    setVoiceResumptionInFlight: (value) => {
      runtimeRef.current!.setVoiceResumptionInFlight(value);
    },
    createTransport: () => dependencies.createTransport(LIVE_ADAPTER_KEY),
    activateVoiceTransport: (transport) => {
      runtimeRef.current!.cleanupTransport();
      runtimeRef.current!.setActiveTransport(transport);
      runtimeRef.current!.subscribeTransport(transport, handleTransportEvent);
    },
    startVoiceCapture: () => voiceChunkCtrl.startCapture({ shutdownOnFailure: true }),
    setVoiceErrorState: (detail) => settleVoiceErrorState(detail),
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

  endSessionInternal = async (
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

    runtimeRef.current!.beginSessionOperation();

    if (recordEvents) {
      runtimeRef.current!.recordSessionEvent({ type: 'session.end.requested' });
    }

    await teardownActiveRuntime({
      textSessionStatus: 'disconnected',
      preserveLastRuntimeError,
      preserveVoiceRuntimeDiagnostics,
    });
    runtimeRef.current!.setCurrentMode('text');

    if (recordEvents) {
      runtimeRef.current!.recordSessionEvent({ type: 'session.ended' });
    }
  };
  ({ setErrorState, setVoiceErrorState, settleVoiceErrorState } = createSessionControllerErrorHandling({
    clearToken: () => {
      tokenMgr.clear();
    },
    cleanupTransport: () => runtimeRef.current!.cleanupTransport(),
    endSessionInternal: (options) => endSessionInternal(options),
    logRuntimeError,
    resetVoiceTurnTranscriptState: () => runtimeRef.current!.resetVoiceTurnTranscriptState(),
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
      runtimeRef.current!.setVoiceResumptionInFlight(value);
    },
    getVoiceSessionResumptionStatus: () =>
      dependencies.store.getState().voiceSessionResumption.status,
    setVoiceSessionResumption: (patch) => {
      runtimeRef.current!.setVoiceSessionResumption(patch);
    },
    setVoiceSessionStatus: (status) => {
      dependencies.store.getState().setVoiceSessionStatus(status);
    },
    setVoiceToolState: (patch) => {
      runtimeRef.current!.setVoiceToolState(patch);
    },
    textRuntimeFailed: () => {
      textChatCtrl.applyLifecycleEvent({ type: 'runtime.failed' });
    },
    failPendingAssistantTurn: (statusLabel) => {
      textChatCtrl.failPendingAssistantTurn(statusLabel);
    },
  }));
  const modeSwitching = createSessionControllerModeSwitching({
    currentProductMode: () => runtimeRef.current!.currentProductMode(),
    hasSpeechRuntimeActivity: () => hasSpeechRuntimeActivity(),
    hasTextRuntimeActivity: () => textChatCtrl.hasRuntimeActivity(),
    isCurrentSessionOperation: (operationId) => runtimeRef.current!.isCurrentSessionOperation(operationId),
    setCurrentMode: (mode) => {
      runtimeRef.current!.setCurrentMode(mode);
    },
    teardownActiveRuntime: (options) => teardownActiveRuntime(options),
  });

  const ensureExclusiveMode = async (
    targetMode: ProductMode,
    operationId: number,
  ): Promise<void> => {
    await modeSwitching.ensureExclusiveMode(targetMode, operationId);
  };
  return createSessionControllerPublicApi({
    store: dependencies.store,
    performBackendHealthCheck: () => performBackendHealthCheck(),
    startSessionInternal,
    voiceChunkCtrl,
    screenCtrl,
    textChatCtrl,
    runtime: {
      currentSpeechLifecycleStatus: () => runtimeRef.current!.currentSpeechLifecycleStatus(),
      endSessionInternal: (options) => endSessionInternal(options),
      getActiveTransport: () => runtimeRef.current!.getActiveTransport(),
      recordSessionEvent: (event) => runtimeRef.current!.recordSessionEvent(event),
      setVoiceErrorState: (detail) => setVoiceErrorState(detail),
      syncSpeechSilenceTimeout: (status) => runtimeRef.current!.syncSpeechSilenceTimeout(status),
    },
    logRuntimeError,
  });
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
