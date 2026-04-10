import { createDebugEvent } from '../core/runtimeUtils';
import type { AssistantAudioPlayback } from '../audio/audio.types';
import type { RealtimeOutboundGateway } from '../outbound/outbound.types';
import type {
  SessionCommand,
  ProductMode,
  SessionEvent,
} from '../core/session.types';
import type {
  SessionStoreApi,
} from '../core/sessionControllerTypes';
import type { SpeechLifecycleStatus } from '../speech/speech.types';
import type { TextSessionStatus } from '../text/text.types';
import type { DesktopSession } from '../transport/transport.types';
import type {
  VoiceSessionDurabilityState,
  VoicePlaybackDiagnostics,
  VoicePlaybackState,
  VoiceSessionResumptionState,
  VoiceSessionStatus,
  VoiceToolCall,
  VoiceToolState,
} from '../voice/voice.types';
import type {
  SpeechSessionLifecycleEvent,
} from '../speech/speechSessionLifecycle';
import type { CreateEphemeralTokenResponse } from '@livepair/shared-types';
import { createLiveSessionEngine } from './liveSessionEngine';

type SessionControllerRuntimeArgs = {
  logger: {
    onSessionEvent: (event: SessionEvent) => void;
  };
  store: SessionStoreApi;
  mutableRuntime: {
    beginSessionOperation: () => number;
    clearTransportSubscription: () => void;
    getActiveTransport: () => DesktopSession | null;
    getRealtimeOutboundGateway: () => RealtimeOutboundGateway;
    getVoiceResumptionInFlight: () => boolean;
    isCurrentSessionOperation: (operationId: number) => boolean;
    resetRealtimeOutboundGateway: () => void;
    setActiveTransport: (transport: DesktopSession | null) => void;
    subscribeTransport: (
      transport: DesktopSession,
      listener: Parameters<DesktopSession['subscribe']>[0],
    ) => void;
    setVoiceResumptionInFlight: (value: boolean) => void;
  };
  stateSync: {
    applyEngineEventTransition: (transition: import('./liveSessionEngine').LiveSessionEngineEventTransition) => SpeechLifecycleStatus;
    applySpeechLifecycleEvent: (
      event: SpeechSessionLifecycleEvent,
    ) => SpeechLifecycleStatus;
    applyVoiceTranscriptUpdate: (
      role: 'user' | 'assistant',
      text: string,
      isFinal?: boolean,
    ) => void;
    clearCurrentVoiceTranscript: () => void;
    currentProductMode: () => ProductMode;
    currentSpeechLifecycleStatus: () => SpeechLifecycleStatus;
    currentVoiceSessionStatus: () => VoiceSessionStatus;
    getVoicePlayback: () => AssistantAudioPlayback;
    resetVoiceSessionDurability: () => void;
    resetVoiceSessionResumption: () => void;
    resetVoiceToolState: () => void;
    resetVoiceTurnTranscriptState: () => void;
    setCurrentMode: (mode: ProductMode) => void;
    setVoicePlaybackState: (state: VoicePlaybackState) => void;
    setVoiceSessionDurability: (patch: Partial<VoiceSessionDurabilityState>) => void;
    setVoiceSessionResumption: (patch: Partial<VoiceSessionResumptionState>) => void;
    setVoiceSessionStatus: (status: VoiceSessionStatus) => void;
    setVoiceToolState: (patch: Partial<VoiceToolState>) => void;
    syncSpeechSilenceTimeout: (status: SpeechLifecycleStatus) => void;
    syncVoiceDurabilityState: (
      token: CreateEphemeralTokenResponse | null,
      patch?: Partial<VoiceSessionDurabilityState>,
    ) => void;
    updateVoicePlaybackDiagnostics: (
      patch: Partial<VoicePlaybackDiagnostics>,
    ) => void;
  };
  playbackCtrl: {
    isActive: () => boolean;
    release: () => void;
    stop: (nextState?: VoicePlaybackState) => Promise<void>;
  };
  voiceChunkCtrl: {
    flush: () => Promise<void>;
    resetSendChain: () => void;
  };
  voiceToolCtrl: {
    cancel: (detail: string) => void;
    enqueue: (calls: VoiceToolCall[]) => void;
  };
  screenCtrl: {
    resetSendChain: () => void;
    stopInternal: (options?: {
      nextState?: 'disabled' | 'error';
      detail?: string | null;
      preserveDiagnostics?: boolean;
      uploadStatus?: 'idle' | 'error';
    }) => Promise<void>;
  };
  interruptionCtrl: {
    handle: () => void;
    reset: () => void;
  };
  currentTextSessionStatus: () => TextSessionStatus;
  resetTextSessionRuntime: (
    textSessionStatus?: TextSessionStatus,
    options?: { preserveConversationTurns?: boolean },
  ) => void;
  clearPendingAssistantTurn: () => void;
  voiceTranscript: {
    resetTurnTranscriptState: () => void;
    resetTurnCompletedFlag: () => void;
  };
  silenceCtrl: {
    clearAll: () => void;
  };
};

export function createSessionControllerRuntime({
  logger,
  store,
  mutableRuntime,
  stateSync,
  playbackCtrl,
  voiceChunkCtrl,
  voiceToolCtrl,
  screenCtrl,
  interruptionCtrl,
  currentTextSessionStatus,
  resetTextSessionRuntime,
  clearPendingAssistantTurn,
  voiceTranscript,
  silenceCtrl,
}: SessionControllerRuntimeArgs) {
  const engine = createLiveSessionEngine({
    speechLifecycle: store.getState().speechLifecycle,
    voiceSessionStatus: store.getState().voiceSessionStatus,
  });

  const applySessionEvent = (
    event: SessionEvent,
    options: { record?: boolean } = {},
  ): void => {
    const { record = false } = options;
    const transition = engine.applyEvent(event);

    stateSync.applyEngineEventTransition(transition);

    if (!record) {
      return;
    }

    logger.onSessionEvent(event);
    store
      .getState()
      .setLastDebugEvent(
        createDebugEvent(
          'session',
          event.type,
          'detail' in event ? event.detail : undefined,
        ),
      );
  };

  const recordSessionEvent = (event: SessionEvent): void => {
    applySessionEvent(event, { record: true });
  };

  const cleanupTransport = (): void => {
    mutableRuntime.clearTransportSubscription();
    mutableRuntime.setActiveTransport(null);
    mutableRuntime.resetRealtimeOutboundGateway();
    playbackCtrl.release();
    voiceChunkCtrl.resetSendChain();
    voiceToolCtrl.cancel('voice transport cleaned up');
    screenCtrl.resetSendChain();
    interruptionCtrl.reset();
    silenceCtrl.clearAll();
    clearPendingAssistantTurn();
    voiceTranscript.resetTurnCompletedFlag();
  };

  return {
    applySessionEvent,
    applySpeechLifecycleEvent: stateSync.applySpeechLifecycleEvent,
    applyVoiceTranscriptUpdate: stateSync.applyVoiceTranscriptUpdate,
    beginSessionOperation: mutableRuntime.beginSessionOperation,
    cleanupTransport,
    clearCurrentVoiceTranscript: stateSync.clearCurrentVoiceTranscript,
    currentProductMode: stateSync.currentProductMode,
    currentSpeechLifecycleStatus: () => engine.getState().speechLifecycle.status,
    currentTextSessionStatus,
    currentVoiceSessionStatus: () => engine.getState().voiceSessionStatus,
    deriveTurnCompleteEvent: () => engine.deriveTurnCompleteEvent(),
    enqueueVoiceToolCalls: (calls: VoiceToolCall[]): void => {
      voiceToolCtrl.enqueue(calls);
    },
    getActiveTransport: mutableRuntime.getActiveTransport,
    getRealtimeOutboundGateway: mutableRuntime.getRealtimeOutboundGateway,
    getVoicePlayback: stateSync.getVoicePlayback,
    getVoiceResumptionInFlight: mutableRuntime.getVoiceResumptionInFlight,
    handleSessionCommand: (command: SessionCommand) => engine.handleCommand(command),
    handleVoiceInterruption: (): void => {
      interruptionCtrl.handle();
    },
    isCurrentSessionOperation: mutableRuntime.isCurrentSessionOperation,
    recordSessionEvent,
    resetRuntimeState: (
      textSessionStatus: TextSessionStatus = 'idle',
      options?: { preserveConversationTurns?: boolean },
    ): void => {
      resetTextSessionRuntime(textSessionStatus, options);
      voiceTranscript.resetTurnTranscriptState();
    },
    resetVoiceSessionDurability: stateSync.resetVoiceSessionDurability,
    resetVoiceSessionResumption: stateSync.resetVoiceSessionResumption,
    resetVoiceToolState: stateSync.resetVoiceToolState,
    resetVoiceTurnTranscriptState: stateSync.resetVoiceTurnTranscriptState,
    setActiveTransport: mutableRuntime.setActiveTransport,
    setCurrentMode: stateSync.setCurrentMode,
    setVoicePlaybackState: stateSync.setVoicePlaybackState,
    setVoiceResumptionInFlight: mutableRuntime.setVoiceResumptionInFlight,
    setVoiceSessionDurability: stateSync.setVoiceSessionDurability,
    setVoiceSessionResumption: stateSync.setVoiceSessionResumption,
    setVoiceSessionStatus: stateSync.setVoiceSessionStatus,
    setVoiceToolState: stateSync.setVoiceToolState,
    shouldIgnoreAssistantOutput: (
      eventType: 'text-delta' | 'output-transcript' | 'audio-chunk' | 'turn-complete',
      options: {
        hasQueuedMixedModeAssistantReply: boolean;
        hasStreamingAssistantVoiceTurn: boolean;
      },
    ) => engine.shouldIgnoreAssistantOutput(eventType, options),
    stopScreenCaptureInternal: screenCtrl.stopInternal,
    stopVoicePlayback: (nextState: VoicePlaybackState = 'stopped'): Promise<void> =>
      playbackCtrl.stop(nextState),
    subscribeTransport: mutableRuntime.subscribeTransport,
    syncSpeechSilenceTimeout: stateSync.syncSpeechSilenceTimeout,
    syncVoiceDurabilityState: (
      token: CreateEphemeralTokenResponse | null,
      patch: Partial<VoiceSessionDurabilityState> = {},
    ): void => {
      stateSync.syncVoiceDurabilityState(token, patch);
    },
    updateVoicePlaybackDiagnostics: stateSync.updateVoicePlaybackDiagnostics,
  };
}
