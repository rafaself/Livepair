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
import {
  createAssistantAudioPlayback,
  type AssistantAudioPlaybackObserver,
} from './assistantAudioPlayback';
import { createLocalVoiceCapture, type LocalVoiceCapture } from './localVoiceCapture';
import {
  createLocalScreenCapture,
  type LocalScreenCapture,
  type LocalScreenCaptureObserver,
} from './localScreenCapture';
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
import {
  appendAssistantTextDelta as appendAssistantTextDeltaCtx,
  appendAssistantTurn as appendAssistantTurnCtx,
  appendUserTurn as appendUserTurnCtx,
  buildTextChatRequest as buildTextChatRequestCtx,
  clearPendingAssistantTurn as clearPendingAssistantTurnCtx,
  completePendingAssistantTurn as completePendingAssistantTurnCtx,
  createConversationContext,
  failPendingAssistantTurn as failPendingAssistantTurnCtx,
} from './conversationTurnManager';
import { isTokenValidForReconnect } from './voiceSessionToken';
import {
  createDefaultVoiceSessionDurabilityState,
  createDefaultVoiceSessionResumptionState,
} from './defaults';
import { asErrorDetail, createDebugEvent } from './runtimeUtils';
import {
  isSessionActiveLifecycle,
  isTextSessionConnectable,
  isTextTurnInFlight,
  reduceTextSessionLifecycle,
  type TextSessionLifecycleEvent,
} from './textSessionLifecycle';
import type {
  DesktopSession,
  LocalVoiceChunk,
  AssistantAudioPlayback,
  LiveSessionEvent,
  RuntimeLogger,
  SessionControllerEvent,
  SpeechLifecycleStatus,
  SessionMode,
  ProductMode,
  TextSessionStatus,
  TransportKind,
  VoiceCaptureDiagnostics,
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
  TextChatRequest,
  TextChatStreamEvent,
} from '@livepair/shared-types';

const TEXT_CHAT_ADAPTER_KEY: TransportKind = 'backend-text';
const VOICE_SESSION_NOT_READY_DETAIL = 'Voice session is not ready';

type SessionStoreApi = Pick<typeof useSessionStore, 'getState'>;
type SettingsStoreApi = Pick<typeof useSettingsStore, 'getState'>;
type DebugAssistantState = Parameters<
  ReturnType<SessionStoreApi['getState']>['setAssistantState']
>[0];

export type DesktopSessionController = {
  checkBackendHealth: () => Promise<void>;
  startSession: (options: { mode: SessionMode }) => Promise<void>;
  startVoiceCapture: () => Promise<void>;
  stopVoiceCapture: () => Promise<void>;
  startScreenCapture: () => Promise<void>;
  stopScreenCapture: () => Promise<void>;
  subscribeToVoiceChunks: (listener: (chunk: LocalVoiceChunk) => void) => () => void;
  submitTextTurn: (text: string) => Promise<boolean>;
  endSession: () => Promise<void>;
  setAssistantState: (assistantState: DebugAssistantState) => void;
};

export type DesktopSessionControllerDependencies = {
  logger: RuntimeLogger;
  checkBackendHealth: typeof checkBackendHealth;
  startTextChatStream: typeof startTextChatStream;
  requestSessionToken: typeof requestSessionToken;
  createTransport: (kind: TransportKind) => DesktopSession;
  createVoiceCapture: (
    observer: {
      onChunk: (chunk: LocalVoiceChunk) => void;
      onDiagnostics: (diagnostics: Partial<VoiceCaptureDiagnostics>) => void;
      onError: (detail: string) => void;
    },
  ) => LocalVoiceCapture;
  createVoicePlayback: (
    observer: AssistantAudioPlaybackObserver,
    options: { selectedOutputDeviceId: string },
  ) => AssistantAudioPlayback;
  createScreenCapture: (observer: LocalScreenCaptureObserver) => LocalScreenCapture;
  store: SessionStoreApi;
  settingsStore: SettingsStoreApi;
};

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
  let activeTextChatStream:
    | Awaited<ReturnType<DesktopSessionControllerDependencies['startTextChatStream']>>
    | null = null;
  let sessionOperationId = 0;
  const conversationCtx = createConversationContext(dependencies.store);
  let voiceCapture: LocalVoiceCapture | null = null;
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
  let voiceSendChain = Promise.resolve();
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
  const voiceChunkListeners = new Set<(chunk: LocalVoiceChunk) => void>();

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

  const clearPendingAssistantTurn = (): void => {
    clearPendingAssistantTurnCtx(conversationCtx);
  };

  const getVoiceCapture = (): LocalVoiceCapture => {
    if (!voiceCapture) {
      voiceCapture = dependencies.createVoiceCapture({
        onChunk: (chunk) => {
          for (const listener of voiceChunkListeners) {
            listener(chunk);
          }

          dependencies.store.getState().setVoiceCaptureDiagnostics({
            chunkCount: chunk.sequence,
            sampleRateHz: chunk.sampleRateHz,
            bytesPerChunk: chunk.data.byteLength,
            chunkDurationMs: chunk.durationMs,
            lastError: null,
          });
          void enqueueVoiceChunkSend(chunk);
        },
        onDiagnostics: (diagnostics) => {
          dependencies.store.getState().setVoiceCaptureDiagnostics(diagnostics);
        },
        onError: (detail) => {
          dependencies.store.getState().setVoiceCaptureState('error');
          dependencies.store.getState().setVoiceSessionStatus('error');
          dependencies.store.getState().setLastRuntimeError(detail);
          dependencies.store.getState().setVoiceCaptureDiagnostics({
            lastError: detail,
          });
          logRuntimeError('voice-capture', 'local capture failed', { detail });
        },
      });
    }

    return voiceCapture;
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

  const currentTextSessionStatus = (): TextSessionStatus => {
    return dependencies.store.getState().textSessionLifecycle.status;
  };

  const applyLifecycleEvent = (
    event: TextSessionLifecycleEvent,
  ): TextSessionStatus => {
    const store = dependencies.store.getState();
    const previousStatus = store.textSessionLifecycle.status;
    const nextLifecycle = reduceTextSessionLifecycle(store.textSessionLifecycle, event);

    if (nextLifecycle.status !== previousStatus) {
      store.setTextSessionLifecycle(nextLifecycle);
      logLifecycleTransition(previousStatus, nextLifecycle.status, event.type);
    }

    return nextLifecycle.status;
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

  const releaseTextChatStream = (): void => {
    const stream = activeTextChatStream;
    activeTextChatStream = null;
    stream?.cancel().catch(() => {});
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
    voiceSendChain = Promise.resolve();
    voiceToolCtrl.resetChain();
    screenCtrl.resetSendChain();
    interruptionCtrl.reset();
    releaseTextChatStream();
    silenceCtrl.clearAll();
    clearPendingAssistantTurn();
    voiceTranscript.resetTurnCompletedFlag();
  };

  const beginSessionOperation = (): number => {
    sessionOperationId += 1;
    return sessionOperationId;
  };

  const isCurrentSessionOperation = (operationId: number): boolean =>
    operationId === sessionOperationId;

  const appendAssistantTextDelta = (text: string): void => {
    appendAssistantTextDeltaCtx(conversationCtx, text);
  };

  const completePendingAssistantTurn = (statusLabel?: string): void => {
    completePendingAssistantTurnCtx(conversationCtx, statusLabel);
  };

  const failPendingAssistantTurn = (statusLabel: string): void => {
    failPendingAssistantTurnCtx(conversationCtx, statusLabel);
  };

  const resetRuntimeState = (textSessionStatus: TextSessionStatus = 'idle'): void => {
    clearPendingAssistantTurn();
    voiceTranscript.resetTurnCompletedFlag();
    dependencies.store.getState().resetTextSessionRuntime(textSessionStatus);
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
    applyLifecycleEvent({ type: 'runtime.failed' });
    logRuntimeError('session', 'runtime entered error state', { detail });
    failPendingAssistantTurn(failedTurnStatusLabel);
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

  const enqueueVoiceChunkSend = (chunk: LocalVoiceChunk): Promise<void> => {
    const store = dependencies.store.getState();

    if (!activeTransport || currentVoiceSessionStatus() === 'disconnected') {
      return Promise.resolve();
    }

    if (
      currentVoiceSessionStatus() === 'ready' ||
      currentVoiceSessionStatus() === 'interrupted' ||
      currentVoiceSessionStatus() === 'recovering'
    ) {
      setVoiceSessionStatus('capturing');
    }

    voiceSendChain = voiceSendChain
      .then(async () => {
        await activeTransport?.sendAudioChunk(chunk.data);
        if (
          currentVoiceSessionStatus() === 'capturing' ||
          currentVoiceSessionStatus() === 'ready' ||
          currentVoiceSessionStatus() === 'interrupted' ||
          currentVoiceSessionStatus() === 'recovering'
        ) {
          setVoiceSessionStatus('streaming');
        }
      })
      .catch((error) => {
        const detail = asErrorDetail(error, 'Failed to stream microphone audio');
        store.setVoiceCaptureDiagnostics({
          lastError: detail,
        });
        setVoiceErrorState(detail);
      });

    return voiceSendChain;
  };

  const flushVoiceAudioInput = async (): Promise<void> => {
    await voiceSendChain;
    await activeTransport?.sendAudioStreamEnd();
  };

  const enqueueVoiceToolCalls = (calls: VoiceToolCall[]): void => {
    voiceToolCtrl.enqueue(calls);
  };

  const resumeVoiceSession = async (detail: string): Promise<void> => {
    const store = dependencies.store.getState();
    const resumeHandle = store.voiceSessionResumption.latestHandle;
    let tokenToUse: CreateEphemeralTokenResponse | null = tokenMgr.get();

    if (!resumeHandle || !store.voiceSessionResumption.resumable) {
      setVoiceSessionResumption({
        status: 'resumeFailed',
        lastDetail: detail,
      });
      setVoiceSessionDurability({
        tokenValid: isTokenValidForReconnect(tokenMgr.get()),
        lastDetail: detail,
      });
      setVoiceErrorState(detail);
      return;
    }

    const operationId = beginSessionOperation();
    const previousTransport = activeTransport;

    voiceResumptionInFlight = true;
    setVoiceSessionStatus('recovering');
    setVoiceSessionResumption({
      status: 'reconnecting',
      lastDetail: detail,
    });
    setVoiceSessionDurability({
      tokenValid: isTokenValidForReconnect(tokenMgr.get()),
      tokenRefreshing: false,
      tokenRefreshFailed: false,
      lastDetail: detail,
    });
    store.setLastRuntimeError(null);
    store.setActiveTransport(null);

    unsubscribeTransport?.();
    unsubscribeTransport = null;
    activeTransport = null;
    voiceSendChain = Promise.resolve();
    screenCtrl.resetSendChain();
    interruptionCtrl.reset();
    clearPendingAssistantTurn();
    voiceTranscript.resetTurnCompletedFlag();

    try {
      await stopVoicePlayback();
    } catch {
      // Ignore playback teardown errors while replacing the transport.
    }

    void previousTransport?.disconnect().catch(() => undefined);

    if (!isTokenValidForReconnect(tokenToUse)) {
      tokenToUse = await refreshVoiceSessionToken(operationId, detail);

      if (!tokenToUse || !isCurrentSessionOperation(operationId)) {
        if (isCurrentSessionOperation(operationId)) {
          const failureDetail =
            dependencies.store.getState().voiceSessionDurability.lastDetail ?? detail;
          setVoiceSessionResumption({
            status: 'resumeFailed',
            lastDetail: failureDetail,
          });
          voiceResumptionInFlight = false;
          setVoiceErrorState(failureDetail);
        }
        return;
      }
    }
    const transport = dependencies.createTransport(LIVE_ADAPTER_KEY);
    activeTransport = transport;
    unsubscribeTransport = transport.subscribe(handleTransportEvent);

    try {
      if (!tokenToUse) {
        throw new Error('Voice session token was unavailable for resume');
      }

      await transport.connect({
        token: tokenToUse,
        mode: 'voice',
        resumeHandle,
      });

      if (!isCurrentSessionOperation(operationId)) {
        void transport.disconnect().catch(() => undefined);
      }
    } catch (error) {
      if (!isCurrentSessionOperation(operationId)) {
        return;
      }

      const resumeDetail = asErrorDetail(error, 'Failed to resume voice session');
      setVoiceSessionResumption({
        status: 'resumeFailed',
        lastDetail: resumeDetail,
      });
      setVoiceSessionDurability({
        tokenValid: isTokenValidForReconnect(tokenToUse),
        tokenRefreshing: false,
        tokenRefreshFailed: false,
        lastDetail: resumeDetail,
      });
      voiceResumptionInFlight = false;
      setVoiceErrorState(resumeDetail);
    }
  };

  const handleTransportEvent = (event: LiveSessionEvent): void => {
    const store = dependencies.store.getState();

    dependencies.logger.onTransportEvent(event);
    store.setLastDebugEvent(
      createDebugEvent(
        'transport',
        event.type,
        'detail' in event ? event.detail : undefined,
      ),
    );

    if (event.type === 'connection-state-changed') {
      if (event.state === 'connecting') {
        setVoiceSessionStatus(voiceResumptionInFlight ? 'recovering' : 'connecting');
        return;
      }

      if (event.state === 'connected') {
        setVoiceSessionStatus('ready');
        resetVoiceToolState();
        store.setAssistantActivity('idle');
        store.setActiveTransport(LIVE_ADAPTER_KEY);
        store.setLastRuntimeError(null);
        resetVoiceTurnTranscriptState();
        setVoiceSessionResumption({
          status: voiceResumptionInFlight ? 'resumed' : 'connected',
          lastDetail:
            voiceResumptionInFlight
              ? store.voiceSessionResumption.lastDetail
              : null,
        });
        syncVoiceDurabilityState(tokenMgr.get(), {
          lastDetail: store.voiceSessionDurability.lastDetail,
        });
        voiceResumptionInFlight = false;
        setVoicePlaybackState('idle');
        updateVoicePlaybackDiagnostics({
          chunkCount: 0,
          queueDepth: 0,
          sampleRateHz: null,
          lastError: null,
          selectedOutputDeviceId:
            dependencies.settingsStore.getState().settings.selectedOutputDeviceId,
        });
        return;
      }

      if (voiceResumptionInFlight) {
        setVoiceSessionStatus('recovering');
        return;
      }

      setVoiceSessionStatus('disconnected');
      resetVoiceTurnTranscriptState();
      resetVoiceToolState();
      void stopVoicePlayback();
      cleanupTransport();
      store.setAssistantActivity('idle');
      store.setActiveTransport(null);
      return;
    }

    if (event.type === 'go-away') {
      const detail = event.detail ?? 'Voice session unavailable';
      setVoiceSessionResumption({
        status: 'goAway',
        lastDetail: detail,
      });
      setVoiceSessionDurability({
        tokenValid: isTokenValidForReconnect(tokenMgr.get()),
        lastDetail: detail,
      });
      void resumeVoiceSession(detail);
      return;
    }

    if (event.type === 'connection-terminated') {
      if (
        currentVoiceSessionStatus() === 'stopping' ||
        currentVoiceSessionStatus() === 'disconnected' ||
        currentVoiceSessionStatus() === 'error'
      ) {
        return;
      }

      setVoiceSessionDurability({
        tokenValid: isTokenValidForReconnect(tokenMgr.get()),
        lastDetail: event.detail ?? 'Voice session unavailable',
      });
      void resumeVoiceSession(event.detail ?? 'Voice session unavailable');
      return;
    }

    if (event.type === 'error') {
      setVoiceErrorState(event.detail);
      return;
    }

    if (event.type === 'session-resumption-update') {
      setVoiceSessionResumption({
        latestHandle: event.handle ?? store.voiceSessionResumption.latestHandle,
        resumable: event.resumable,
        lastDetail: event.detail ?? store.voiceSessionResumption.lastDetail,
      });
      return;
    }

    if (event.type === 'audio-error') {
      updateVoicePlaybackDiagnostics({
        lastError: event.detail,
      });
      dependencies.store.getState().setLastRuntimeError(event.detail);
      void stopVoicePlayback('error');
      return;
    }

    if (event.type === 'interrupted') {
      voiceTranscript.markTurnCompleted();
      handleVoiceInterruption();
      return;
    }

    if (event.type === 'input-transcript') {
      applySpeechLifecycleEvent({ type: 'user.speech.detected' });
      applyVoiceTranscriptUpdate('user', event.text, event.isFinal);
      return;
    }

    if (event.type === 'output-transcript') {
      applySpeechLifecycleEvent({ type: 'assistant.output.started' });
      applyVoiceTranscriptUpdate('assistant', event.text, event.isFinal);
      return;
    }

    if (event.type === 'audio-chunk') {
      applySpeechLifecycleEvent({ type: 'assistant.output.started' });
      void getVoicePlayback()
        .enqueue(event.chunk)
        .catch(() => {});
      return;
    }

    if (event.type === 'tool-call') {
      enqueueVoiceToolCalls(event.calls);
      return;
    }

    if (event.type === 'turn-complete') {
      voiceTranscript.markTurnCompleted();
      if (currentSpeechLifecycleStatus() === 'assistantSpeaking') {
        applySpeechLifecycleEvent({ type: 'assistant.turn.completed' });
        return;
      }

      if (currentSpeechLifecycleStatus() === 'userSpeaking') {
        applySpeechLifecycleEvent({ type: 'user.turn.settled' });
      }
    }
  };

  const handleTextChatStreamEvent = (event: TextChatStreamEvent): void => {
    if (event.type === 'text-delta') {
      applyLifecycleEvent({ type: 'response.delta.received' });
      appendAssistantTextDelta(event.text);
      return;
    }

    if (event.type === 'completed') {
      const previousStatus = currentTextSessionStatus();
      releaseTextChatStream();
      applyLifecycleEvent({ type: 'response.turn.completed' });
      completePendingAssistantTurn(
        previousStatus === 'interrupted' ? 'Interrupted' : undefined,
      );
      dependencies.store.getState().setAssistantActivity('idle');
      return;
    }

    dependencies.logger.onTransportEvent({ type: 'error', detail: event.detail });
    dependencies.store
      .getState()
      .setLastDebugEvent(createDebugEvent('transport', 'error', event.detail));
    releaseTextChatStream();
    setErrorState(event.detail, 'Response failed');
  };

  const appendUserTurn = (content: string): void => {
    appendUserTurnCtx(conversationCtx, content);
  };

  const buildTextChatRequest = (text: string): TextChatRequest => {
    return buildTextChatRequestCtx(conversationCtx, text);
  };

  const ensureTextSessionReady = async (): Promise<boolean> => {
    if (currentTextSessionStatus() === 'ready' || currentTextSessionStatus() === 'completed') {
      return true;
    }

    await startSessionInternal({ mode: 'text' });

    return (
      currentTextSessionStatus() === 'ready' ||
      currentTextSessionStatus() === 'completed'
    );
  };

  const requestVoiceSessionToken = (operationId: number) => {
    return tokenMgr.request(operationId);
  };

  const refreshVoiceSessionToken = (
    operationId: number,
    detail: string,
  ): Promise<CreateEphemeralTokenResponse | null> => {
    return tokenMgr.refresh(operationId, detail);
  };

  const startVoiceCaptureInternal = async (
    options: {
      shutdownOnFailure?: boolean;
    } = {},
  ): Promise<boolean> => {
    const { shutdownOnFailure = false } = options;
    const store = dependencies.store.getState();

    if (
      store.voiceCaptureState === 'requestingPermission' ||
      store.voiceCaptureState === 'capturing'
    ) {
      return true;
    }

    if (
      store.voiceSessionStatus !== 'ready' &&
      store.voiceSessionStatus !== 'interrupted' &&
      store.voiceSessionStatus !== 'recovering'
    ) {
      store.setVoiceCaptureState('error');
      store.setVoiceCaptureDiagnostics({
        lastError: VOICE_SESSION_NOT_READY_DETAIL,
      });

      if (shutdownOnFailure) {
        store.setVoiceSessionStatus('error');
        store.setLastRuntimeError(VOICE_SESSION_NOT_READY_DETAIL);
        void endSessionInternal({
          preserveLastRuntimeError: VOICE_SESSION_NOT_READY_DETAIL,
          preserveVoiceRuntimeDiagnostics: true,
        });
      }

      return false;
    }

    const selectedInputDeviceId =
      dependencies.settingsStore.getState().settings.selectedInputDeviceId;
    const {
      voiceEchoCancellationEnabled,
      voiceNoiseSuppressionEnabled,
      voiceAutoGainControlEnabled,
    } = dependencies.settingsStore.getState().settings;
    store.setVoiceCaptureState('requestingPermission');
    store.setVoiceCaptureDiagnostics({
      chunkCount: 0,
      sampleRateHz: 16_000,
      bytesPerChunk: 640,
      chunkDurationMs: 20,
      selectedInputDeviceId,
      lastError: null,
    });

    try {
      await getVoiceCapture().start({
        selectedInputDeviceId,
        echoCancellationEnabled: voiceEchoCancellationEnabled,
        noiseSuppressionEnabled: voiceNoiseSuppressionEnabled,
        autoGainControlEnabled: voiceAutoGainControlEnabled,
      });
      dependencies.store.getState().setVoiceCaptureState('capturing');
      dependencies.store.getState().setVoiceSessionStatus('ready');
      return true;
    } catch (error) {
      const detail = asErrorDetail(error, 'Failed to start microphone capture');
      dependencies.store.getState().setVoiceCaptureState('error');
      dependencies.store.getState().setVoiceSessionStatus('error');
      dependencies.store.getState().setVoiceCaptureDiagnostics({
        lastError: detail,
        selectedInputDeviceId,
      });
      dependencies.store.getState().setLastRuntimeError(detail);

      if (shutdownOnFailure) {
        void endSessionInternal({
          preserveLastRuntimeError: detail,
          preserveVoiceRuntimeDiagnostics: true,
        });
      }

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

        const didStartVoiceCapture = await startVoiceCaptureInternal({
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
    applyLifecycleEvent({ type: 'bootstrap.started' });
    recordSessionEvent({
      type: 'session.start.requested',
      transport: TEXT_CHAT_ADAPTER_KEY,
    });
    logRuntimeDiagnostic('session', 'start requested', {
      mode,
      transport: TEXT_CHAT_ADAPTER_KEY,
    });

    const isHealthy = await performBackendHealthCheck(operationId);

    if (!isHealthy || !isCurrentSessionOperation(operationId)) {
      return;
    }

    applyLifecycleEvent({ type: 'transport.connected' });
    dependencies.store.getState().setActiveTransport(TEXT_CHAT_ADAPTER_KEY);
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
        applyLifecycleEvent({ type: 'runtime.failed' });
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
      applyLifecycleEvent({ type: 'runtime.failed' });
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

  const hasTextRuntimeActivity = (): boolean => {
    return (
      activeTextChatStream !== null ||
      isSessionActiveLifecycle(currentTextSessionStatus()) ||
      dependencies.store.getState().activeTransport === TEXT_CHAT_ADAPTER_KEY
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
      activeTextChatStream !== null ||
      voiceCapture !== null ||
      playbackCtrl.isActive() ||
      screenCtrl.isActive() ||
      hasSpeechRuntimeActivity() ||
      hasTextRuntimeActivity();

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

    if (activeTextChatStream || isSessionActiveLifecycle(currentTextSessionStatus())) {
      applyLifecycleEvent({ type: 'disconnect.requested' });
    }

    if (hasSpeechRuntimeActivity()) {
      applySpeechLifecycleEvent({ type: 'session.end.requested' });
      store.setVoiceSessionStatus('stopping');
    }

    try {
      const capture = voiceCapture;
      if (
        capture &&
        (
          store.voiceCaptureState === 'capturing' ||
          store.voiceCaptureState === 'requestingPermission' ||
          store.voiceCaptureState === 'stopping'
        )
      ) {
        await flushVoiceAudioInput();
        await capture.stop();
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
      store.setVoiceCaptureState(voiceCapture ? 'stopped' : 'idle');
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
      (currentProductMode() !== 'speech' || hasTextRuntimeActivity());

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
      await startVoiceCaptureInternal();
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
        await flushVoiceAudioInput();
        await getVoiceCapture().stop();
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
      voiceChunkListeners.add(listener);

      return () => {
        voiceChunkListeners.delete(listener);
      };
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
          appendUserTurn(trimmedText);
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

      if (
        currentProductMode() === 'text' &&
        isTextTurnInFlight(currentTextSessionStatus())
      ) {
        return false;
      }

      const isReady = await ensureTextSessionReady();

      if (!isReady) {
        logRuntimeError('session', 'submit aborted because text chat is unavailable', {
          textLength: trimmedText.length,
        });
        return false;
      }

      applyLifecycleEvent({ type: 'submit.started' });

      try {
        activeTextChatStream = await dependencies.startTextChatStream(
          buildTextChatRequest(trimmedText),
          handleTextChatStreamEvent,
        );
      } catch (error) {
        setErrorState(asErrorDetail(error, 'Failed to start text chat'), 'Response failed');
        return false;
      }

      appendUserTurn(trimmedText);
      logRuntimeDiagnostic('session', 'text turn submitted', {
        textLength: trimmedText.length,
      });
      dependencies.store.getState().setLastRuntimeError(null);
      return true;
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
