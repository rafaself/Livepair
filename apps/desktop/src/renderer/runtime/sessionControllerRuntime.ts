import { createDebugEvent } from './core/runtimeUtils';
import type { AssistantAudioPlayback } from './audio/audio.types';
import type {
  ProductMode,
  SessionControllerEvent,
  SessionMode,
} from './core/session.types';
import type {
  SessionStoreApi,
} from './core/sessionControllerTypes';
import type { SpeechLifecycleStatus } from './speech/speech.types';
import type { TextSessionStatus } from './text/text.types';
import type { DesktopSession } from './transport/transport.types';
import type {
  VoiceSessionDurabilityState,
  VoicePlaybackDiagnostics,
  VoicePlaybackState,
  VoiceSessionResumptionState,
  VoiceSessionStatus,
  VoiceToolCall,
  VoiceToolState,
} from './voice/voice.types';
import type {
  SpeechSessionLifecycleEvent,
} from './speech/speechSessionLifecycle';
import type { CreateEphemeralTokenResponse } from '@livepair/shared-types';

type SessionControllerRuntimeArgs = {
  logger: {
    onSessionEvent: (event: SessionControllerEvent) => void;
  };
  store: SessionStoreApi;
  mutableRuntime: {
    beginSessionOperation: () => number;
    clearTransportSubscription: () => void;
    getActiveTransport: () => DesktopSession | null;
    getVoiceResumptionInFlight: () => boolean;
    isCurrentSessionOperation: (operationId: number) => boolean;
    setActiveTransport: (transport: DesktopSession | null) => void;
    subscribeTransport: (
      transport: DesktopSession,
      listener: Parameters<DesktopSession['subscribe']>[0],
    ) => void;
    setVoiceResumptionInFlight: (value: boolean) => void;
  };
  stateSync: {
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
    resolveProductMode: (mode: SessionMode) => ProductMode;
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
  textChatCtrl: {
    clearPendingAssistantTurn: () => void;
    currentStatus: () => TextSessionStatus;
    releaseStream: () => void;
    resetRuntime: (textSessionStatus?: TextSessionStatus) => void;
  };
  voiceTranscript: {
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
  textChatCtrl,
  voiceTranscript,
  silenceCtrl,
}: SessionControllerRuntimeArgs) {
  const recordSessionEvent = (event: SessionControllerEvent): void => {
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

  const cleanupTransport = (): void => {
    mutableRuntime.clearTransportSubscription();
    mutableRuntime.setActiveTransport(null);
    playbackCtrl.release();
    voiceChunkCtrl.resetSendChain();
    voiceToolCtrl.cancel('voice transport cleaned up');
    screenCtrl.resetSendChain();
    interruptionCtrl.reset();
    textChatCtrl.releaseStream();
    silenceCtrl.clearAll();
    textChatCtrl.clearPendingAssistantTurn();
    voiceTranscript.resetTurnCompletedFlag();
  };

  return {
    applySpeechLifecycleEvent: stateSync.applySpeechLifecycleEvent,
    applyVoiceTranscriptUpdate: stateSync.applyVoiceTranscriptUpdate,
    beginSessionOperation: mutableRuntime.beginSessionOperation,
    cleanupTransport,
    clearCurrentVoiceTranscript: stateSync.clearCurrentVoiceTranscript,
    currentProductMode: stateSync.currentProductMode,
    currentSpeechLifecycleStatus: stateSync.currentSpeechLifecycleStatus,
    currentTextSessionStatus: textChatCtrl.currentStatus,
    currentVoiceSessionStatus: stateSync.currentVoiceSessionStatus,
    enqueueVoiceToolCalls: (calls: VoiceToolCall[]): void => {
      voiceToolCtrl.enqueue(calls);
    },
    getActiveTransport: mutableRuntime.getActiveTransport,
    getVoicePlayback: stateSync.getVoicePlayback,
    getVoiceResumptionInFlight: mutableRuntime.getVoiceResumptionInFlight,
    handleVoiceInterruption: (): void => {
      interruptionCtrl.handle();
    },
    isCurrentSessionOperation: mutableRuntime.isCurrentSessionOperation,
    recordSessionEvent,
    resetRuntimeState: (textSessionStatus: TextSessionStatus = 'idle'): void => {
      textChatCtrl.resetRuntime(textSessionStatus);
      voiceTranscript.resetTurnCompletedFlag();
    },
    resetVoiceSessionDurability: stateSync.resetVoiceSessionDurability,
    resetVoiceSessionResumption: stateSync.resetVoiceSessionResumption,
    resetVoiceToolState: stateSync.resetVoiceToolState,
    resetVoiceTurnTranscriptState: stateSync.resetVoiceTurnTranscriptState,
    resolveProductMode: stateSync.resolveProductMode,
    setActiveTransport: mutableRuntime.setActiveTransport,
    setCurrentMode: stateSync.setCurrentMode,
    setVoicePlaybackState: stateSync.setVoicePlaybackState,
    setVoiceResumptionInFlight: mutableRuntime.setVoiceResumptionInFlight,
    setVoiceSessionDurability: stateSync.setVoiceSessionDurability,
    setVoiceSessionResumption: stateSync.setVoiceSessionResumption,
    setVoiceSessionStatus: stateSync.setVoiceSessionStatus,
    setVoiceToolState: stateSync.setVoiceToolState,
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
