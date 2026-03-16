import { isAssistantTurnUnavailable } from './transportEventGating';
import type { LiveSessionEvent } from './transport.types';
import type { TransportEventRouterContext } from './transportEventRouterTypes';

type CanonicalAssistantOutputEventType = 'text-delta' | 'turn-complete';
type TranscriptOrAudioEventType = 'audio-chunk' | 'output-transcript';
type AssistantOutputEventType = CanonicalAssistantOutputEventType | TranscriptOrAudioEventType;
type AssistantOutputIgnoreReason = 'turn-unavailable' | 'lifecycle-fence' | 'no-open-turn-fence';

type IgnoredAssistantOutputDiagnostics = {
  counts: Record<AssistantOutputEventType, number>;
  lastIgnoredReason: AssistantOutputIgnoreReason;
  lastIgnoredEventType: AssistantOutputEventType;
  lastIgnoredVoiceStatus: ReturnType<TransportEventRouterContext['ops']['currentVoiceSessionStatus']>;
};

const ignoredAssistantOutputDiagnostics = new WeakMap<object, IgnoredAssistantOutputDiagnostics>();

function getIgnoredAssistantOutputDiagnostics(
  context: TransportEventRouterContext,
): IgnoredAssistantOutputDiagnostics {
  const existing = ignoredAssistantOutputDiagnostics.get(context.store);

  if (existing) {
    return existing;
  }

  const next: IgnoredAssistantOutputDiagnostics = {
    counts: {
      'text-delta': 0,
      'output-transcript': 0,
      'audio-chunk': 0,
      'turn-complete': 0,
    },
    lastIgnoredReason: 'turn-unavailable',
    lastIgnoredEventType: 'text-delta',
    lastIgnoredVoiceStatus: context.ops.currentVoiceSessionStatus(),
  };
  ignoredAssistantOutputDiagnostics.set(context.store, next);
  return next;
}

function buildIgnoredAssistantOutputDetail(
  context: TransportEventRouterContext,
  eventType: AssistantOutputEventType,
  reason: AssistantOutputIgnoreReason,
): Record<string, unknown> {
  const diagnostics = getIgnoredAssistantOutputDiagnostics(context);
  const voiceStatus = context.ops.currentVoiceSessionStatus();

  diagnostics.counts[eventType] += 1;
  diagnostics.lastIgnoredReason = reason;
  diagnostics.lastIgnoredEventType = eventType;
  diagnostics.lastIgnoredVoiceStatus = voiceStatus;

  // Promote ignored-output counts to the session store so the debug view can
  // surface them without log scraping. The WeakMap remains as the cheap
  // in-handler accumulator; the store gets the same values for observability.
  context.ops.updateVoiceLiveSignalDiagnostics({
    ignoredTextDeltaCount: diagnostics.counts['text-delta'],
    ignoredOutputTranscriptCount: diagnostics.counts['output-transcript'],
    ignoredAudioChunkCount: diagnostics.counts['audio-chunk'],
    ignoredTurnCompleteCount: diagnostics.counts['turn-complete'],
    lastIgnoredReason: reason,
    lastIgnoredEventType: eventType,
    lastIgnoredVoiceStatus: voiceStatus,
  });

  return {
    voiceStatus,
    eventType,
    ignoreReason: reason,
    ignoreCount: diagnostics.counts[eventType],
    ignoredTextDeltaCount: diagnostics.counts['text-delta'],
    ignoredOutputTranscriptCount: diagnostics.counts['output-transcript'],
    ignoredAudioChunkCount: diagnostics.counts['audio-chunk'],
    ignoredTurnCompleteCount: diagnostics.counts['turn-complete'],
    lastIgnoredReason: diagnostics.lastIgnoredReason,
    lastIgnoredEventType: diagnostics.lastIgnoredEventType,
    lastIgnoredVoiceStatus: diagnostics.lastIgnoredVoiceStatus,
  };
}

function logIgnoredUnavailableAssistantOutput(
  context: TransportEventRouterContext,
  eventType: AssistantOutputEventType,
  detail: Record<string, unknown> = {},
): void {
  context.ops.logRuntimeDiagnostic('voice-session', 'ignored assistant output while turn is unavailable', {
    ...buildIgnoredAssistantOutputDetail(context, eventType, 'turn-unavailable'),
    ...detail,
  });
}

function shouldIgnoreCanonicalAssistantOutput(
  context: TransportEventRouterContext,
  eventType: CanonicalAssistantOutputEventType,
): boolean {
  const { ops } = context;
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

  logIgnoredUnavailableAssistantOutput(context, eventType, {
    hasQueuedMixedModeAssistantReply: ops.hasQueuedMixedModeAssistantReply(),
    hasStreamingAssistantVoiceTurn: ops.hasStreamingAssistantVoiceTurn(),
    hasOpenVoiceTurnFence: ops.hasOpenVoiceTurnFence(),
  });
  return true;
}

function shouldIgnoreTranscriptOrAudio(
  context: TransportEventRouterContext,
  eventType: TranscriptOrAudioEventType,
): boolean {
  const { ops } = context;
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

  logIgnoredUnavailableAssistantOutput(context, eventType, {
    hasQueuedMixedModeAssistantReply: ops.hasQueuedMixedModeAssistantReply(),
    hasStreamingAssistantVoiceTurn: ops.hasStreamingAssistantVoiceTurn(),
    hasOpenVoiceTurnFence: ops.hasOpenVoiceTurnFence(),
  });
  return true;
}

function ensureAssistantVoiceTurn(
  context: TransportEventRouterContext,
  eventType: 'text-delta' | 'output-transcript' | 'audio-chunk',
): boolean {
  if (context.ops.ensureAssistantVoiceTurn()) {
    return true;
  }

  context.ops.logRuntimeDiagnostic('voice-session', 'ignored assistant output after lifecycle fence', {
    ...buildIgnoredAssistantOutputDetail(context, eventType, 'lifecycle-fence'),
    hasOpenVoiceTurnFence: context.ops.hasOpenVoiceTurnFence(),
    hasQueuedMixedModeAssistantReply: context.ops.hasQueuedMixedModeAssistantReply(),
    hasStreamingAssistantVoiceTurn: context.ops.hasStreamingAssistantVoiceTurn(),
  });
  return false;
}

function handleTurnCompleteLifecycleTransition(context: TransportEventRouterContext): void {
  const speechLifecycleStatus = context.ops.currentSpeechLifecycleStatus();

  if (speechLifecycleStatus === 'assistantSpeaking') {
    context.ops.applySpeechLifecycleEvent({ type: 'assistant.turn.completed' });
    return;
  }

  if (speechLifecycleStatus === 'userSpeaking') {
    context.ops.applySpeechLifecycleEvent({ type: 'user.turn.settled' });
  }
}

export function handleTransportTurnEvent(
  context: TransportEventRouterContext,
  event: LiveSessionEvent,
): void {
  const { ops } = context;

  switch (event.type) {
    case 'interrupted':
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

    case 'text-delta':
      if (shouldIgnoreCanonicalAssistantOutput(context, 'text-delta')) {
        return;
      }

      if (!ensureAssistantVoiceTurn(context, 'text-delta')) {
        return;
      }

      ops.appendAssistantDraftTextDelta(event.text);

      // Track text-delta usage in voice mode as the "text fallback" signal.
      // Voice status 'disconnected' means text mode — skip counting there.
      if (ops.currentVoiceSessionStatus() !== 'disconnected') {
        const now = new Date().toISOString();
        ops.updateVoiceLiveSignalDiagnostics({
          assistantTextFallbackCount:
            context.store.voiceLiveSignalDiagnostics.assistantTextFallbackCount + 1,
          lastAssistantTextFallbackAt: now,
        });
      }
      return;

    case 'input-transcript': {
      const now = new Date().toISOString();
      ops.applySpeechLifecycleEvent({ type: 'user.speech.detected' });
      ops.applyVoiceTranscriptUpdate('user', event.text, event.isFinal);
      ops.updateVoiceLiveSignalDiagnostics({
        inputTranscriptCount: context.store.voiceLiveSignalDiagnostics.inputTranscriptCount + 1,
        lastInputTranscriptAt: now,
      });
      return;
    }

    case 'output-transcript':
      if (shouldIgnoreTranscriptOrAudio(context, 'output-transcript')) {
        return;
      }

      if (!ensureAssistantVoiceTurn(context, 'output-transcript')) {
        return;
      }

      ops.applySpeechLifecycleEvent({ type: 'assistant.output.started' });
      ops.applyVoiceTranscriptUpdate('assistant', event.text, event.isFinal);
      {
        const now = new Date().toISOString();
        ops.updateVoiceLiveSignalDiagnostics({
          outputTranscriptCount:
            context.store.voiceLiveSignalDiagnostics.outputTranscriptCount + 1,
          lastOutputTranscriptAt: now,
        });
      }
      return;

    case 'audio-chunk':
      if (shouldIgnoreTranscriptOrAudio(context, 'audio-chunk')) {
        return;
      }

      if (!ensureAssistantVoiceTurn(context, 'audio-chunk')) {
        return;
      }

      ops.applySpeechLifecycleEvent({ type: 'assistant.output.started' });
      void ops.getVoicePlayback()
        .enqueue(event.chunk)
        .catch(() => {});
      return;

    case 'generation-complete':
      return;

    case 'answer-metadata':
      ops.setAssistantAnswerMetadata(event.answerMetadata);
      return;

    case 'tool-call': {
      const voiceStatus = ops.currentVoiceSessionStatus();

      if (isAssistantTurnUnavailable(voiceStatus)) {
        ops.logRuntimeDiagnostic('voice-session', 'ignored tool call while turn is unavailable', {
          voiceStatus,
          callCount: event.calls.length,
        });
        return;
      }

      ops.enqueueVoiceToolCalls(event.calls);
      return;
    }

    case 'turn-complete':
      if (!ops.hasOpenVoiceTurnFence()) {
        ops.logRuntimeDiagnostic('voice-session', 'ignored turn-complete without an open turn fence', {
          ...buildIgnoredAssistantOutputDetail(context, 'turn-complete', 'no-open-turn-fence'),
          hasOpenVoiceTurnFence: false,
          hasPendingVoiceToolCall: ops.hasPendingVoiceToolCall(),
        });
        return;
      }

      if (shouldIgnoreCanonicalAssistantOutput(context, 'turn-complete')) {
        return;
      }

      ops.completeAssistantDraft();
      ops.finalizeCurrentVoiceTurns('completed');
      ops.attachCurrentAssistantTurn(ops.commitAssistantDraft());
      handleTurnCompleteLifecycleTransition(context);
      return;

    default:
      return;
  }
}
