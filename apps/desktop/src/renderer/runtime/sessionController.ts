import { checkBackendHealth, requestSessionToken, startTextChatStream } from '../api/backend';
import { useSessionStore } from '../store/sessionStore';
import { useSettingsStore } from '../store/settingsStore';
import {
  defaultRuntimeLogger,
  logLifecycleTransition,
  logRuntimeDiagnostic,
  logRuntimeError,
} from './logger';
import { formatConversationTimestamp } from './conversationTimestamp';
import { createGeminiLiveTransport } from './geminiLiveTransport';
import { LIVE_ADAPTER_KEY } from './liveConfig';
import {
  createAssistantAudioPlayback,
  type AssistantAudioPlaybackObserver,
} from './assistantAudioPlayback';
import { createLocalVoiceCapture, type LocalVoiceCapture } from './localVoiceCapture';
import {
  isSessionActiveLifecycle,
  isTextSessionConnectable,
  isTextTurnInFlight,
  reduceTextSessionLifecycle,
  type TextSessionLifecycleEvent,
} from './textSessionLifecycle';
import type {
  ConversationTurnModel,
  DesktopSession,
  LocalVoiceChunk,
  AssistantAudioPlayback,
  LiveSessionEvent,
  RuntimeLogger,
  SessionControllerEvent,
  SessionMode,
  TextSessionStatus,
  TransportKind,
  VoiceCaptureDiagnostics,
  VoiceSessionStatus,
  VoicePlaybackDiagnostics,
  VoicePlaybackState,
} from './types';
import type {
  TextChatMessage,
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
  store: SessionStoreApi;
  settingsStore: SettingsStoreApi;
};

function asErrorDetail(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return fallback;
}

function createDebugEvent(
  scope: 'session' | 'transport',
  type: string,
  detail?: string,
) {
  return {
    scope,
    type,
    at: new Date().toISOString(),
    detail,
  };
}

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
  let nextUserTurnId = 0;
  let nextAssistantTurnId = 0;
  let pendingAssistantTurnId: string | null = null;
  let voiceCapture: LocalVoiceCapture | null = null;
  let voicePlayback: AssistantAudioPlayback | null = null;
  let voiceSendChain = Promise.resolve();
  let voiceInterruptionInFlight: Promise<void> | null = null;
  let voiceInterruptionSequence = 0;
  let voiceTurnHasCompleted = false;
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

  const getConversationTurn = (turnId: string): ConversationTurnModel | undefined => {
    return dependencies.store
      .getState()
      .conversationTurns.find((turn) => turn.id === turnId);
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
    dependencies.store.getState().setVoicePlaybackDiagnostics(patch);
  };

  const setVoicePlaybackState = (state: VoicePlaybackState): void => {
    dependencies.store.getState().setVoicePlaybackState(state);

    if (state === 'playing' || state === 'buffering') {
      dependencies.store.getState().setAssistantActivity('speaking');
      return;
    }

    if (state === 'stopped' || state === 'idle' || state === 'error') {
      dependencies.store.getState().setAssistantActivity('idle');
    }
  };

  const getVoicePlayback = (): AssistantAudioPlayback => {
    if (!voicePlayback) {
      const selectedOutputDeviceId =
        dependencies.settingsStore.getState().settings.selectedOutputDeviceId;
      voicePlayback = dependencies.createVoicePlayback(
        {
          onStateChange: (state) => {
            setVoicePlaybackState(state);
          },
          onDiagnostics: (diagnostics) => {
            updateVoicePlaybackDiagnostics(diagnostics);
          },
          onError: (detail) => {
            updateVoicePlaybackDiagnostics({
              lastError: detail,
            });
            setVoicePlaybackState('error');
            dependencies.store.getState().setLastRuntimeError(detail);
          },
        },
        {
          selectedOutputDeviceId,
        },
      );
      updateVoicePlaybackDiagnostics({
        selectedOutputDeviceId,
      });
    }

    return voicePlayback;
  };

  const clearPendingAssistantTurn = (): void => {
    pendingAssistantTurnId = null;
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

  const releaseTextChatStream = (): void => {
    const stream = activeTextChatStream;
    activeTextChatStream = null;
    stream?.cancel().catch(() => {});
  };

  const currentVoiceSessionStatus = (): VoiceSessionStatus => {
    return dependencies.store.getState().voiceSessionStatus;
  };

  const setVoiceSessionStatus = (status: VoiceSessionStatus): void => {
    dependencies.store.getState().setVoiceSessionStatus(status);
  };

  const clearCurrentVoiceTranscript = (): void => {
    dependencies.store.getState().clearCurrentVoiceTranscript();
  };

  const resetVoiceTurnTranscriptState = (): void => {
    voiceTurnHasCompleted = false;
    clearCurrentVoiceTranscript();
  };

  const normalizeTranscriptText = (previous: string, incoming: string): string => {
    if (incoming.length === 0 || incoming === previous) {
      return previous;
    }

    if (previous.length === 0) {
      return incoming;
    }

    if (incoming.startsWith(previous) || incoming.length > previous.length) {
      return incoming;
    }

    if (incoming.length < previous.length) {
      return incoming;
    }

    const overlapLimit = Math.min(previous.length, incoming.length);

    for (let overlap = overlapLimit; overlap > 0; overlap -= 1) {
      if (previous.endsWith(incoming.slice(0, overlap))) {
        return `${previous}${incoming.slice(overlap)}`;
      }
    }

    return `${previous}${incoming}`;
  };

  const applyVoiceTranscriptUpdate = (
    role: 'user' | 'assistant',
    text: string,
    isFinal?: boolean,
  ): void => {
    const store = dependencies.store.getState();

    if (role === 'user' && voiceTurnHasCompleted) {
      clearCurrentVoiceTranscript();
      voiceTurnHasCompleted = false;
    }

    const previousEntry = store.currentVoiceTranscript[role];
    const nextText = normalizeTranscriptText(previousEntry.text, text);

    if (nextText === previousEntry.text && isFinal === previousEntry.isFinal) {
      return;
    }

    store.setCurrentVoiceTranscriptEntry(role, {
      text: nextText,
      ...(isFinal !== undefined ? { isFinal } : {}),
    });
  };

  const cleanupTransport = (): void => {
    unsubscribeTransport?.();
    unsubscribeTransport = null;
    activeTransport = null;
    voicePlayback = null;
    voiceSendChain = Promise.resolve();
    voiceInterruptionInFlight = null;
    voiceInterruptionSequence += 1;
    releaseTextChatStream();
    clearPendingAssistantTurn();
    voiceTurnHasCompleted = false;
  };

  const beginSessionOperation = (): number => {
    sessionOperationId += 1;
    return sessionOperationId;
  };

  const isCurrentSessionOperation = (operationId: number): boolean =>
    operationId === sessionOperationId;

  const updatePendingAssistantTurn = (
    content: string,
    state: ConversationTurnModel['state'],
    statusLabel?: string,
  ): void => {
    if (!pendingAssistantTurnId) {
      return;
    }

    dependencies.store.getState().updateConversationTurn(pendingAssistantTurnId, {
      content,
      state,
      statusLabel,
    });
  };

  const appendAssistantTurn = (
    content: string,
    state: ConversationTurnModel['state'],
    statusLabel?: string,
  ): void => {
    const turnId = `assistant-turn-${++nextAssistantTurnId}`;
    pendingAssistantTurnId = turnId;
    dependencies.store.getState().appendConversationTurn({
      id: turnId,
      role: 'assistant',
      content,
      timestamp: formatConversationTimestamp(),
      state,
      statusLabel,
    });
  };

  const appendAssistantTextDelta = (text: string): void => {
    if (!pendingAssistantTurnId) {
      appendAssistantTurn(text, 'streaming', 'Responding...');
      return;
    }

    const currentTurn = getConversationTurn(pendingAssistantTurnId);

    if (!currentTurn) {
      appendAssistantTurn(text, 'streaming', 'Responding...');
      return;
    }

    updatePendingAssistantTurn(
      `${currentTurn.content}${text}`,
      'streaming',
      'Responding...',
    );
  };

  const completePendingAssistantTurn = (statusLabel?: string): void => {
    if (!pendingAssistantTurnId) {
      return;
    }

    const currentTurn = getConversationTurn(pendingAssistantTurnId);

    if (!currentTurn) {
      clearPendingAssistantTurn();
      return;
    }

    updatePendingAssistantTurn(currentTurn.content, 'complete', statusLabel);
    clearPendingAssistantTurn();
  };

  const failPendingAssistantTurn = (statusLabel: string): void => {
    if (!pendingAssistantTurnId) {
      return;
    }

    const currentTurn = getConversationTurn(pendingAssistantTurnId);

    if (!currentTurn) {
      clearPendingAssistantTurn();
      return;
    }

    updatePendingAssistantTurn(currentTurn.content, 'error', statusLabel);
    clearPendingAssistantTurn();
  };

  const resetRuntimeState = (textSessionStatus: TextSessionStatus = 'idle'): void => {
    clearPendingAssistantTurn();
    voiceTurnHasCompleted = false;
    dependencies.store.getState().resetTextSessionRuntime(textSessionStatus);
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
    const transport = activeTransport;
    const store = dependencies.store.getState();
    resetVoiceTurnTranscriptState();
    store.setVoiceSessionStatus('error');
    store.setVoiceCaptureState('error');
    store.setLastRuntimeError(detail);
    store.setActiveTransport(null);
    setVoicePlaybackState('stopped');
    updateVoicePlaybackDiagnostics({
      queueDepth: 0,
    });
    store.setAssistantActivity('idle');
    void voicePlayback?.stop().catch(() => {});
    voicePlayback = null;
    cleanupTransport();
    void transport?.disconnect().catch(() => {});
  };

  const stopVoicePlayback = async (
    nextState: VoicePlaybackState = 'stopped',
  ): Promise<void> => {
    const playback = voicePlayback;
    voicePlayback = null;

    if (!playback) {
      setVoicePlaybackState(nextState);
      updateVoicePlaybackDiagnostics({
        queueDepth: 0,
      });
      return;
    }

    setVoicePlaybackState('stopping');
    await playback.stop();
    setVoicePlaybackState(nextState);
    updateVoicePlaybackDiagnostics({
      queueDepth: 0,
    });
  };

  const handleVoiceInterruption = (): void => {
    if (voiceInterruptionInFlight) {
      return;
    }

    voiceInterruptionSequence += 1;
    const interruptionSequence = voiceInterruptionSequence;
    setVoiceSessionStatus('interrupted');
    dependencies.store.getState().setAssistantActivity('idle');

    voiceInterruptionInFlight = (async () => {
      try {
        await stopVoicePlayback();
      } catch {
        // Ignore playback teardown errors while recovering from interruption.
      }

      if (voiceInterruptionSequence !== interruptionSequence) {
        return;
      }

      voiceInterruptionInFlight = null;

      if (!activeTransport || currentVoiceSessionStatus() !== 'interrupted') {
        return;
      }

      setVoiceSessionStatus(
        dependencies.store.getState().voiceCaptureState === 'capturing'
          ? 'recovering'
          : 'ready',
      );
    })();
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
        setVoiceSessionStatus('connecting');
        return;
      }

      if (event.state === 'connected') {
        setVoiceSessionStatus('ready');
        store.setAssistantActivity('idle');
        store.setActiveTransport(LIVE_ADAPTER_KEY);
        store.setLastRuntimeError(null);
        resetVoiceTurnTranscriptState();
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

      setVoiceSessionStatus('disconnected');
      resetVoiceTurnTranscriptState();
      void stopVoicePlayback();
      cleanupTransport();
      store.setAssistantActivity('idle');
      store.setActiveTransport(null);
      return;
    }

    if (event.type === 'go-away') {
      setVoiceErrorState(event.detail ?? 'Voice session unavailable');
      return;
    }

    if (event.type === 'error') {
      setVoiceErrorState(event.detail);
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
      voiceTurnHasCompleted = true;
      handleVoiceInterruption();
      return;
    }

    if (event.type === 'input-transcript') {
      applyVoiceTranscriptUpdate('user', event.text, event.isFinal);
      return;
    }

    if (event.type === 'output-transcript') {
      applyVoiceTranscriptUpdate('assistant', event.text, event.isFinal);
      return;
    }

    if (event.type === 'audio-chunk') {
      void getVoicePlayback()
        .enqueue(event.chunk)
        .catch(() => {});
      return;
    }

    if (event.type === 'turn-complete') {
      voiceTurnHasCompleted = true;
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
    dependencies.store.getState().appendConversationTurn({
      id: `user-turn-${++nextUserTurnId}`,
      role: 'user',
      content,
      timestamp: formatConversationTimestamp(),
      state: 'complete',
    });
  };

  const buildTextChatRequest = (text: string): TextChatRequest => {
    const messages: TextChatMessage[] = dependencies.store
      .getState()
      .conversationTurns
      .filter(
        (turn) =>
          (turn.role === 'user' || turn.role === 'assistant') &&
          turn.content.trim().length > 0 &&
          turn.state !== 'error',
      )
      .map((turn) => ({
        role: turn.role === 'assistant' ? 'assistant' : 'user',
        content: turn.content,
      }));

    messages.push({
      role: 'user',
      content: text,
    });

    return { messages };
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

  const requestVoiceSessionToken = async (operationId: number) => {
    const store = dependencies.store.getState();
    store.setTokenRequestState('loading');
    recordSessionEvent({ type: 'session.token.request.started' });

    try {
      const token = await dependencies.requestSessionToken({});

      if (!isCurrentSessionOperation(operationId)) {
        return null;
      }

      store.setTokenRequestState('success');
      store.setBackendState('connected');
      recordSessionEvent({
        type: 'session.token.request.succeeded',
        transport: LIVE_ADAPTER_KEY,
      });
      return token;
    } catch (error) {
      if (!isCurrentSessionOperation(operationId)) {
        return null;
      }

      const detail = asErrorDetail(error, 'Failed to request voice session token');
      store.setTokenRequestState('error');
      store.setBackendState('failed');
      recordSessionEvent({ type: 'session.token.request.failed', detail });
      setVoiceErrorState(detail);
      return null;
    }
  };

  const startSessionInternal = async ({
    mode,
  }: {
    mode: SessionMode;
  }): Promise<void> => {
    if (mode === 'voice') {
      if (currentVoiceSessionStatus() !== 'disconnected' && currentVoiceSessionStatus() !== 'error') {
        return;
      }

      const operationId = beginSessionOperation();
      const store = dependencies.store.getState();
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

      const transport = dependencies.createTransport(LIVE_ADAPTER_KEY);
      cleanupTransport();
      activeTransport = transport;
      unsubscribeTransport = transport.subscribe(handleTransportEvent);

      try {
        await transport.connect({
          token,
          mode: 'voice',
        });
      } catch (error) {
        if (!isCurrentSessionOperation(operationId)) {
          return;
        }

        setVoiceErrorState(asErrorDetail(error, 'Failed to connect voice session'));
      }

      return;
    }

    const status = currentTextSessionStatus();

    if (!isTextSessionConnectable(status) && isSessionActiveLifecycle(status)) {
      return;
    }

    const operationId = beginSessionOperation();
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

  return {
    checkBackendHealth: async () => {
      await performBackendHealthCheck();
    },
    startSession: async ({ mode }) => {
      await startSessionInternal({ mode });
    },
    startVoiceCapture: async () => {
      const store = dependencies.store.getState();

      if (
        store.voiceCaptureState === 'requestingPermission' ||
        store.voiceCaptureState === 'capturing'
      ) {
        return;
      }

       if (store.voiceSessionStatus !== 'ready') {
        store.setVoiceCaptureState('error');
        store.setVoiceCaptureDiagnostics({
          lastError: VOICE_SESSION_NOT_READY_DETAIL,
        });
        return;
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
        dependencies.store.getState().setVoiceSessionStatus('capturing');
      } catch (error) {
        const detail = asErrorDetail(error, 'Failed to start microphone capture');
        dependencies.store.getState().setVoiceCaptureState('error');
        dependencies.store.getState().setVoiceSessionStatus('error');
        dependencies.store.getState().setVoiceCaptureDiagnostics({
          lastError: detail,
          selectedInputDeviceId,
        });
        dependencies.store.getState().setLastRuntimeError(detail);
      }
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

      if (isTextTurnInFlight(currentTextSessionStatus())) {
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
      const store = dependencies.store.getState();
      beginSessionOperation();

      recordSessionEvent({ type: 'session.end.requested' });

      if (!activeTransport && !activeTextChatStream) {
        resetRuntimeState('disconnected');
        store.setVoiceSessionStatus('disconnected');
        recordSessionEvent({ type: 'session.ended' });
        return;
      }

      applyLifecycleEvent({ type: 'disconnect.requested' });
      store.setVoiceSessionStatus('stopping');

      try {
        if (
          store.voiceCaptureState === 'capturing' ||
          store.voiceCaptureState === 'requestingPermission' ||
          store.voiceCaptureState === 'stopping'
        ) {
          await flushVoiceAudioInput();
          await getVoiceCapture().stop();
        }
        await activeTransport?.disconnect();
        await stopVoicePlayback();
      } finally {
        cleanupTransport();
        resetRuntimeState('disconnected');
        store.setVoiceSessionStatus('disconnected');
        store.setAssistantActivity('idle');
        recordSessionEvent({ type: 'session.ended' });
      }
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
