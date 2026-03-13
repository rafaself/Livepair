import { LIVE_ADAPTER_KEY } from './liveConfig';
import { isTokenValidForReconnect } from '../voice/voiceSessionToken';
import { createDebugEvent } from '../core/runtimeUtils';
import type { SpeechSessionLifecycleEvent } from '../speech/speechSessionLifecycle';
import type { LiveSessionEvent } from './transport.types';
import type { RuntimeLogger } from '../core/session.types';
import type { SpeechLifecycleStatus } from '../speech/speech.types';
import type { AssistantAudioPlayback } from '../audio/audio.types';
import type {
  VoicePlaybackDiagnostics,
  VoicePlaybackState,
  VoiceSessionDurabilityState,
  VoiceSessionResumptionState,
  VoiceSessionStatus,
  VoiceToolCall,
} from '../voice/voice.types';
import type { CreateEphemeralTokenResponse } from '@livepair/shared-types';
import type { SessionStoreApi, SettingsStoreApi } from '../core/sessionControllerTypes';

export type TransportEventRouterOps = {
  store: SessionStoreApi;
  settingsStore: SettingsStoreApi;
  logger: RuntimeLogger;
  logRuntimeDiagnostic: (
    scope: 'voice-session',
    message: string,
    detail: Record<string, unknown>,
  ) => void;
  // State accessors
  isVoiceResumptionInFlight: () => boolean;
  setVoiceResumptionInFlight: (value: boolean) => void;
  currentVoiceSessionStatus: () => VoiceSessionStatus;
  currentSpeechLifecycleStatus: () => SpeechLifecycleStatus;
  getToken: () => CreateEphemeralTokenResponse | null;
  // Voice session state setters
  setVoiceSessionStatus: (status: VoiceSessionStatus) => void;
  setVoiceSessionResumption: (patch: Partial<VoiceSessionResumptionState>) => void;
  setVoiceSessionDurability: (patch: Partial<VoiceSessionDurabilityState>) => void;
  persistLiveSessionResumption: (patch: {
    resumptionHandle: string | null;
    lastResumptionUpdateAt: string;
    restorable: boolean;
    invalidatedAt: string | null;
    invalidationReason: string | null;
  }) => void;
  syncVoiceDurabilityState: (
    token: CreateEphemeralTokenResponse | null,
    patch?: Partial<VoiceSessionDurabilityState>,
  ) => void;
  // Voice playback
  setVoicePlaybackState: (state: VoicePlaybackState) => void;
  updateVoicePlaybackDiagnostics: (patch: Partial<VoicePlaybackDiagnostics>) => void;
  getVoicePlayback: () => AssistantAudioPlayback;
  stopVoicePlayback: (nextState?: VoicePlaybackState) => Promise<void>;
  // Voice controllers
  cancelVoiceToolCalls: (detail?: string) => void;
  resetVoiceToolState: () => void;
  resetVoiceTurnTranscriptState: () => void;
  ensureAssistantVoiceTurn: () => boolean;
  finalizeCurrentVoiceTurns: (
    finalizeReason: 'completed' | 'interrupted',
    options?: { assistantTurnId?: string | null },
  ) => void;
  attachCurrentAssistantTurn: (turnId: string | null) => void;
  enqueueVoiceToolCalls: (calls: VoiceToolCall[]) => void;
  handleVoiceInterruption: () => void;
  // Lifecycle events
  applySpeechLifecycleEvent: (event: SpeechSessionLifecycleEvent) => SpeechLifecycleStatus;
  applyVoiceTranscriptUpdate: (role: 'user' | 'assistant', text: string, isFinal?: boolean) => void;
  appendAssistantDraftTextDelta: (text: string) => void;
  completeAssistantDraft: () => void;
  interruptAssistantDraft: () => void;
  discardAssistantDraft: () => void;
  commitAssistantDraft: () => string | null;
  hasOpenVoiceTurnFence: () => boolean;
  hasPendingVoiceToolCall: () => boolean;
  hasActiveAssistantVoiceTurn: () => boolean;
  hasQueuedMixedModeAssistantReply: () => boolean;
  hasStreamingAssistantVoiceTurn: () => boolean;
  // Error and cleanup
  setVoiceErrorState: (detail: string) => void;
  cleanupTransport: () => void;
  resumeVoiceSession: (detail: string) => Promise<void>;
};

export function createTransportEventRouter(ops: TransportEventRouterOps) {
  const shouldIgnoreTermination = (status: VoiceSessionStatus): boolean => {
    return status === 'stopping' || status === 'disconnected' || status === 'error';
  };

  const isAssistantTurnUnavailable = (status: VoiceSessionStatus): boolean => {
    return (
      status === 'interrupted'
      || status === 'recovering'
      || status === 'stopping'
      || status === 'disconnected'
      || status === 'error'
    );
  };

  const shouldIgnoreCanonicalAssistantOutput = (
    eventType: 'text-delta' | 'turn-complete',
  ): boolean => {
    const voiceStatus = ops.currentVoiceSessionStatus();

    if (!isAssistantTurnUnavailable(voiceStatus)) {
      return false;
    }

    const canContinueUnavailableTurn =
      eventType === 'text-delta'
        ? ops.hasQueuedMixedModeAssistantReply() || ops.hasStreamingAssistantVoiceTurn()
        : ops.hasStreamingAssistantVoiceTurn();

    if (canContinueUnavailableTurn) {
      return false;
    }

    ops.logRuntimeDiagnostic('voice-session', 'ignored assistant output while turn is unavailable', {
      voiceStatus,
      eventType,
    });
    return true;
  };

  const shouldIgnoreTranscriptOrAudio = (
    eventType: 'audio-chunk' | 'output-transcript',
  ): boolean => {
    const voiceStatus = ops.currentVoiceSessionStatus();

    if (!isAssistantTurnUnavailable(voiceStatus)) {
      return false;
    }

    const canContinueUnavailableTurn =
      ops.hasQueuedMixedModeAssistantReply()
      || ops.hasStreamingAssistantVoiceTurn();

    if (canContinueUnavailableTurn) {
      return false;
    }

    ops.logRuntimeDiagnostic('voice-session', 'ignored assistant output while turn is unavailable', {
      voiceStatus,
      eventType,
    });
    return true;
  };

  const handleTransportEvent = (event: LiveSessionEvent): void => {
    const store = ops.store.getState();

    ops.logger.onTransportEvent(event);
    store.setLastDebugEvent(
      createDebugEvent(
        'transport',
        event.type,
        'detail' in event ? event.detail : undefined,
      ),
    );

    if (event.type === 'connection-state-changed') {
      if (event.state === 'connecting') {
        ops.setVoiceSessionStatus(ops.isVoiceResumptionInFlight() ? 'recovering' : 'connecting');
        return;
      }

      if (event.state === 'connected') {
        ops.setVoiceSessionStatus('ready');
        ops.resetVoiceToolState();
        store.setAssistantActivity('idle');
        store.setActiveTransport(LIVE_ADAPTER_KEY);
        store.setLastRuntimeError(null);
        ops.resetVoiceTurnTranscriptState();
        ops.setVoiceSessionResumption({
          status: ops.isVoiceResumptionInFlight() ? 'resumed' : 'connected',
          lastDetail:
            ops.isVoiceResumptionInFlight()
              ? store.voiceSessionResumption.lastDetail
              : null,
        });
        ops.syncVoiceDurabilityState(ops.getToken(), {
          lastDetail: store.voiceSessionDurability.lastDetail,
        });
        ops.setVoiceResumptionInFlight(false);
        ops.setVoicePlaybackState('idle');
        ops.updateVoicePlaybackDiagnostics({
          chunkCount: 0,
          queueDepth: 0,
          sampleRateHz: null,
          lastError: null,
          selectedOutputDeviceId:
            ops.settingsStore.getState().settings.selectedOutputDeviceId,
        });
        return;
      }

      if (ops.isVoiceResumptionInFlight()) {
        ops.setVoiceSessionStatus('recovering');
        return;
      }

      ops.setVoiceSessionStatus('disconnected');
      ops.cancelVoiceToolCalls('voice transport disconnected');
      ops.resetVoiceTurnTranscriptState();
      ops.resetVoiceToolState();
      void ops.stopVoicePlayback();
      ops.cleanupTransport();
      store.setAssistantActivity('idle');
      store.setActiveTransport(null);
      return;
    }

    if (event.type === 'go-away') {
      const voiceStatus = ops.currentVoiceSessionStatus();
      if (shouldIgnoreTermination(voiceStatus)) {
        ops.logRuntimeDiagnostic('voice-session', 'ignored go-away while not resumable', {
          detail: event.detail ?? 'Voice session unavailable',
          voiceStatus,
        });
        return;
      }

      const detail = event.detail ?? 'Voice session unavailable';
      ops.logRuntimeDiagnostic('voice-session', 'resume requested after go-away', {
        detail,
        voiceStatus,
        latestHandle: store.voiceSessionResumption.latestHandle,
        resumable: store.voiceSessionResumption.resumable,
        tokenValid: isTokenValidForReconnect(ops.getToken()),
      });
      ops.cancelVoiceToolCalls(detail);
      ops.setVoiceSessionResumption({
        status: 'goAway',
        lastDetail: detail,
      });
      ops.setVoiceSessionDurability({
        tokenValid: isTokenValidForReconnect(ops.getToken()),
        lastDetail: detail,
      });
      void ops.resumeVoiceSession(detail);
      return;
    }

    if (event.type === 'connection-terminated') {
      const voiceStatus = ops.currentVoiceSessionStatus();
      if (shouldIgnoreTermination(voiceStatus)) {
        ops.logRuntimeDiagnostic('voice-session', 'ignored connection termination while not resumable', {
          detail: event.detail ?? 'Voice session unavailable',
          voiceStatus,
        });
        return;
      }

      ops.logRuntimeDiagnostic('voice-session', 'resume requested after connection termination', {
        detail: event.detail ?? 'Voice session unavailable',
        voiceStatus,
        latestHandle: store.voiceSessionResumption.latestHandle,
        resumable: store.voiceSessionResumption.resumable,
        tokenValid: isTokenValidForReconnect(ops.getToken()),
      });
      ops.cancelVoiceToolCalls(event.detail ?? 'Voice session unavailable');
      ops.setVoiceSessionDurability({
        tokenValid: isTokenValidForReconnect(ops.getToken()),
        lastDetail: event.detail ?? 'Voice session unavailable',
      });
      void ops.resumeVoiceSession(event.detail ?? 'Voice session unavailable');
      return;
    }

    if (event.type === 'error') {
      ops.cancelVoiceToolCalls(event.detail);
      ops.setVoiceErrorState(event.detail);
      return;
    }

    if (event.type === 'session-resumption-update') {
      const updatedAt = new Date().toISOString();
      ops.logRuntimeDiagnostic('voice-session', 'resumption handle updated', {
        previousHandle: store.voiceSessionResumption.latestHandle,
        latestHandle: event.handle,
        resumable: event.resumable,
        detail: event.detail ?? null,
      });
      ops.setVoiceSessionResumption({
        latestHandle: event.handle,
        resumable: event.resumable,
        lastDetail: event.detail ?? null,
      });
      ops.persistLiveSessionResumption({
        resumptionHandle: event.handle,
        lastResumptionUpdateAt: updatedAt,
        restorable: event.resumable,
        invalidatedAt: event.resumable ? null : updatedAt,
        invalidationReason: event.resumable ? null : (event.detail ?? null),
      });
      return;
    }

    if (event.type === 'audio-error') {
      ops.updateVoicePlaybackDiagnostics({
        lastError: event.detail,
      });
      ops.store.getState().setLastRuntimeError(event.detail);
      void ops.stopVoicePlayback('error');
      return;
    }

    if (event.type === 'generation-complete') {
      return;
    }

    if (event.type === 'interrupted') {
      if (!ops.hasOpenVoiceTurnFence() && !ops.hasPendingVoiceToolCall()) {
        ops.logRuntimeDiagnostic('voice-session', 'ignored interrupted event without an open turn fence', {});
        return;
      }

      ops.interruptAssistantDraft();
      ops.discardAssistantDraft();
      ops.cancelVoiceToolCalls('voice turn interrupted');
      ops.finalizeCurrentVoiceTurns('interrupted');
      ops.handleVoiceInterruption();
      return;
    }

    if (event.type === 'text-delta') {
      if (shouldIgnoreCanonicalAssistantOutput('text-delta')) {
        return;
      }

      if (!ops.ensureAssistantVoiceTurn()) {
        ops.logRuntimeDiagnostic('voice-session', 'ignored assistant output after lifecycle fence', {
          eventType: 'text-delta',
        });
        return;
      }

      ops.appendAssistantDraftTextDelta(event.text);
      return;
    }

    if (event.type === 'input-transcript') {
      ops.applySpeechLifecycleEvent({ type: 'user.speech.detected' });
      ops.applyVoiceTranscriptUpdate('user', event.text, event.isFinal);
      return;
    }

    if (event.type === 'output-transcript') {
      if (shouldIgnoreTranscriptOrAudio('output-transcript')) {
        return;
      }

      if (!ops.ensureAssistantVoiceTurn()) {
        ops.logRuntimeDiagnostic('voice-session', 'ignored assistant output after lifecycle fence', {
          eventType: 'output-transcript',
        });
        return;
      }

      ops.applySpeechLifecycleEvent({ type: 'assistant.output.started' });
      ops.applyVoiceTranscriptUpdate('assistant', event.text, event.isFinal);
      return;
    }

    if (event.type === 'audio-chunk') {
      if (shouldIgnoreTranscriptOrAudio('audio-chunk')) {
        return;
      }

      if (!ops.ensureAssistantVoiceTurn()) {
        ops.logRuntimeDiagnostic('voice-session', 'ignored assistant output after lifecycle fence', {
          eventType: 'audio-chunk',
        });
        return;
      }

      ops.applySpeechLifecycleEvent({ type: 'assistant.output.started' });
      void ops.getVoicePlayback()
        .enqueue(event.chunk)
        .catch(() => {});
      return;
    }

    if (event.type === 'tool-call') {
      const voiceStatus = ops.currentVoiceSessionStatus();

      if (
        voiceStatus === 'interrupted' ||
        voiceStatus === 'recovering' ||
        voiceStatus === 'stopping' ||
        voiceStatus === 'disconnected' ||
        voiceStatus === 'error'
      ) {
        ops.logRuntimeDiagnostic('voice-session', 'ignored tool call while turn is unavailable', {
          voiceStatus,
          callCount: event.calls.length,
        });
        return;
      }

      ops.enqueueVoiceToolCalls(event.calls);
      return;
    }

    if (event.type === 'turn-complete') {
      if (!ops.hasOpenVoiceTurnFence()) {
        ops.logRuntimeDiagnostic('voice-session', 'ignored turn-complete without an open turn fence', {});
        return;
      }

      if (shouldIgnoreCanonicalAssistantOutput('turn-complete')) {
        return;
      }

      ops.completeAssistantDraft();
      ops.finalizeCurrentVoiceTurns('completed');
      const assistantTurnId = ops.commitAssistantDraft();
      ops.attachCurrentAssistantTurn(assistantTurnId);
      if (ops.currentSpeechLifecycleStatus() === 'assistantSpeaking') {
        ops.applySpeechLifecycleEvent({ type: 'assistant.turn.completed' });
        return;
      }

      if (ops.currentSpeechLifecycleStatus() === 'userSpeaking') {
        ops.applySpeechLifecycleEvent({ type: 'user.turn.settled' });
      }
    }
  };

  return { handleTransportEvent };
}
