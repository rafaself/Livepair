import type { LiveSessionEvent } from './transport.types';
import type { TransportEventRouterContext } from './transportEventRouterTypes';

type CanonicalAssistantOutputEventType = 'text-delta' | 'turn-complete';
type TranscriptOrAudioEventType = 'audio-chunk' | 'output-transcript';
type AssistantOutputEventType = CanonicalAssistantOutputEventType | TranscriptOrAudioEventType;
type AssistantOutputIgnoreReason = 'turn-unavailable' | 'lifecycle-fence' | 'no-open-turn-fence';

type IgnoredAssistantOutputDiagnostics = {
  counts: Record<AssistantOutputEventType, number>;
  reasons: Record<AssistantOutputIgnoreReason, number>;
  lastIgnoredReason: AssistantOutputIgnoreReason;
  lastIgnoredEventType: AssistantOutputEventType;
  lastIgnoredVoiceStatus: ReturnType<TransportEventRouterContext['ops']['currentVoiceSessionStatus']>;
  assistantTextFallbackActive: boolean;
};

const ignoredAssistantOutputDiagnostics = new WeakMap<object, IgnoredAssistantOutputDiagnostics>();

function emitDiagnostic(
  context: TransportEventRouterContext,
  event: {
    scope: 'voice-session';
    name: string;
    level?: 'info' | 'error';
    detail?: string | null;
    data?: Record<string, unknown>;
  },
): void {
  if (context.ops.emitDiagnostic) {
    context.ops.emitDiagnostic(event);
    return;
  }

  context.ops.logRuntimeDiagnostic?.(event.scope, event.name, {
    ...(event.detail ? { detail: event.detail } : {}),
    ...event.data,
  });
}

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
    reasons: {
      'turn-unavailable': 0,
      'lifecycle-fence': 0,
      'no-open-turn-fence': 0,
    },
    lastIgnoredReason: 'turn-unavailable',
    lastIgnoredEventType: 'text-delta',
    lastIgnoredVoiceStatus: context.ops.currentVoiceSessionStatus(),
    assistantTextFallbackActive: false,
  };
  ignoredAssistantOutputDiagnostics.set(context.store, next);
  return next;
}

function recordTranscriptArrival(
  context: TransportEventRouterContext,
  channel: 'input' | 'output',
): void {
  const now = new Date().toISOString();
  const diagnostics = context.store.voiceTranscriptDiagnostics;

  if (channel === 'input') {
    context.store.setVoiceTranscriptDiagnostics({
      inputTranscriptCount: diagnostics.inputTranscriptCount + 1,
      lastInputTranscriptAt: now,
    });
    return;
  }

  context.store.setVoiceTranscriptDiagnostics({
    outputTranscriptCount: diagnostics.outputTranscriptCount + 1,
    lastOutputTranscriptAt: now,
  });
}

function recordAssistantTextFallback(context: TransportEventRouterContext): void {
  const diagnostics = getIgnoredAssistantOutputDiagnostics(context);

  if (diagnostics.assistantTextFallbackActive) {
    return;
  }

  diagnostics.assistantTextFallbackActive = true;
  const now = new Date().toISOString();
  const transcriptDiagnostics = context.store.voiceTranscriptDiagnostics;
  context.store.setVoiceTranscriptDiagnostics({
    assistantTextFallbackCount: transcriptDiagnostics.assistantTextFallbackCount + 1,
    lastAssistantTextFallbackAt: now,
    lastAssistantTextFallbackReason: 'missing-output-transcript',
  });
}

function resetAssistantTextFallback(context: TransportEventRouterContext): void {
  getIgnoredAssistantOutputDiagnostics(context).assistantTextFallbackActive = false;
}

function buildIgnoredAssistantOutputDetail(
  context: TransportEventRouterContext,
  eventType: AssistantOutputEventType,
  reason: AssistantOutputIgnoreReason,
): Record<string, unknown> {
  const diagnostics = getIgnoredAssistantOutputDiagnostics(context);
  const voiceStatus = context.ops.currentVoiceSessionStatus();
  const ignoredAt = new Date().toISOString();

  diagnostics.counts[eventType] += 1;
  diagnostics.reasons[reason] += 1;
  diagnostics.lastIgnoredReason = reason;
  diagnostics.lastIgnoredEventType = eventType;
  diagnostics.lastIgnoredVoiceStatus = voiceStatus;
  context.store.setIgnoredAssistantOutputDiagnostics({
    totalCount: Object.values(diagnostics.counts).reduce((sum, count) => sum + count, 0),
    countsByEventType: {
      textDelta: diagnostics.counts['text-delta'],
      outputTranscript: diagnostics.counts['output-transcript'],
      audioChunk: diagnostics.counts['audio-chunk'],
      turnComplete: diagnostics.counts['turn-complete'],
    },
    countsByReason: {
      turnUnavailable: diagnostics.reasons['turn-unavailable'],
      lifecycleFence: diagnostics.reasons['lifecycle-fence'],
      noOpenTurnFence: diagnostics.reasons['no-open-turn-fence'],
    },
    lastIgnoredAt: ignoredAt,
    lastIgnoredReason: diagnostics.lastIgnoredReason,
    lastIgnoredEventType: diagnostics.lastIgnoredEventType,
    lastIgnoredVoiceSessionStatus: diagnostics.lastIgnoredVoiceStatus,
  });

  // Promote ignored-output counts to the session store so the debug view can
  // surface them without log scraping. The WeakMap remains as the cheap
  // in-handler accumulator; the store gets the same values for observability.
  context.ops.updateVoiceLiveSignalDiagnostics({
    ignoredOutputTotalCount:
      diagnostics.counts['text-delta']
      + diagnostics.counts['output-transcript']
      + diagnostics.counts['audio-chunk']
      + diagnostics.counts['turn-complete'],
    ignoredTextDeltaCount: diagnostics.counts['text-delta'],
    ignoredOutputTranscriptCount: diagnostics.counts['output-transcript'],
    ignoredAudioChunkCount: diagnostics.counts['audio-chunk'],
    ignoredTurnCompleteCount: diagnostics.counts['turn-complete'],
    lastIgnoredReason: reason,
    lastIgnoredEventType: eventType,
    lastIgnoredVoiceStatus: voiceStatus,
  });

  return {
    ignoredAt,
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
  emitDiagnostic(context, {
    scope: 'voice-session',
    name: 'ignored assistant output while turn is unavailable',
    data: {
      ...buildIgnoredAssistantOutputDetail(context, eventType, 'turn-unavailable'),
      ...detail,
    },
  });
}

function shouldIgnoreCanonicalAssistantOutput(
  context: TransportEventRouterContext,
  eventType: CanonicalAssistantOutputEventType,
): boolean {
  const { ops } = context;
  const decision = ops.shouldIgnoreAssistantOutput(eventType, {
    hasQueuedMixedModeAssistantReply: ops.hasQueuedMixedModeAssistantReply(),
    hasStreamingAssistantVoiceTurn: ops.hasStreamingAssistantVoiceTurn(),
  });

  if (!decision.ignore) {
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
  const decision = ops.shouldIgnoreAssistantOutput(eventType, {
    hasQueuedMixedModeAssistantReply: ops.hasQueuedMixedModeAssistantReply(),
    hasStreamingAssistantVoiceTurn: ops.hasStreamingAssistantVoiceTurn(),
  });

  if (!decision.ignore) {
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

  emitDiagnostic(context, {
    scope: 'voice-session',
    name: 'ignored assistant output after lifecycle fence',
    data: {
      ...buildIgnoredAssistantOutputDetail(context, eventType, 'lifecycle-fence'),
      hasOpenVoiceTurnFence: context.ops.hasOpenVoiceTurnFence(),
      hasQueuedMixedModeAssistantReply: context.ops.hasQueuedMixedModeAssistantReply(),
      hasStreamingAssistantVoiceTurn: context.ops.hasStreamingAssistantVoiceTurn(),
    },
  });
  return false;
}

// Ensures the active assistant voice turn exists and emits
// `turn.assistant.output.started` exactly once per turn transition. Returning
// false tells the caller the lifecycle fence rejected the chunk and no further
// processing should happen.
function openAssistantVoiceTurnIfNeeded(
  context: TransportEventRouterContext,
  eventType: 'output-transcript' | 'audio-chunk',
): boolean {
  const wasStreaming = context.ops.hasStreamingAssistantVoiceTurn();

  if (!ensureAssistantVoiceTurn(context, eventType)) {
    return false;
  }

  if (!wasStreaming) {
    context.ops.recordSessionEvent({ type: 'turn.assistant.output.started' });
  }
  return true;
}

export function handleTransportTurnEvent(
  context: TransportEventRouterContext,
  event: LiveSessionEvent,
): void {
  const { ops } = context;

  switch (event.type) {
    case 'interrupted':
      resetAssistantTextFallback(context);
      if (!ops.hasOpenVoiceTurnFence() && !ops.hasPendingVoiceToolCall()) {
        emitDiagnostic(context, {
          scope: 'voice-session',
          name: 'ignored interrupted event without an open turn fence',
        });
        return;
      }

      ops.interruptAssistantDraft();
      ops.discardAssistantDraft();
      ops.cancelVoiceToolCalls('voice turn interrupted');
      ops.finalizeCurrentVoiceTurns('interrupted');
      ops.recordSessionEvent({ type: 'turn.interrupted' });
      ops.handleVoiceInterruption();
      return;

    case 'text-delta':
      if (shouldIgnoreCanonicalAssistantOutput(context, 'text-delta')) {
        return;
      }

      if (!ensureAssistantVoiceTurn(context, 'text-delta')) {
        return;
      }

      recordAssistantTextFallback(context);
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

    case 'input-transcript':
      recordTranscriptArrival(context, 'input');
      const now = new Date().toISOString();
      ops.recordSessionEvent({ type: 'turn.user.speech.detected' });
      ops.recordSessionEvent({
        type: 'transcript.user.updated',
        text: event.text,
        isFinal: event.isFinal === true,
      });
      ops.applyVoiceTranscriptUpdate('user', event.text, event.isFinal);
      ops.updateVoiceLiveSignalDiagnostics({
        inputTranscriptCount: context.store.voiceLiveSignalDiagnostics.inputTranscriptCount + 1,
        lastInputTranscriptAt: now,
      });
      return;
    

    case 'output-transcript':
      recordTranscriptArrival(context, 'output');
      if (shouldIgnoreTranscriptOrAudio(context, 'output-transcript')) {
        return;
      }

      if (!openAssistantVoiceTurnIfNeeded(context, 'output-transcript')) {
        return;
      }

      ops.recordSessionEvent({
        type: 'transcript.assistant.updated',
        text: event.text,
        isFinal: event.isFinal === true,
      });
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

    case 'audio-chunk': {
      if (shouldIgnoreTranscriptOrAudio(context, 'audio-chunk')) {
        return;
      }

      const wasStreaming = ops.hasStreamingAssistantVoiceTurn();

      if (!ensureAssistantVoiceTurn(context, 'audio-chunk')) {
        return;
      }

      if (!wasStreaming) {
        ops.recordSessionEvent({ type: 'turn.assistant.output.started' });
      }
      void ops.getVoicePlayback()
        .enqueue(event.chunk)
        .catch(() => {});
      return;
    }

    case 'generation-complete':
      return;

    case 'answer-metadata':
      ops.setAssistantAnswerMetadata(event.answerMetadata);
      return;

    case 'tool-call': {
      const decision = ops.shouldIgnoreAssistantOutput('output-transcript', {
        hasQueuedMixedModeAssistantReply: ops.hasQueuedMixedModeAssistantReply(),
        hasStreamingAssistantVoiceTurn: ops.hasStreamingAssistantVoiceTurn(),
      });

      if (decision.ignore) {
        emitDiagnostic(context, {
          scope: 'voice-session',
          name: 'ignored tool call while turn is unavailable',
          data: {
            voiceStatus: ops.currentVoiceSessionStatus(),
            callCount: event.calls.length,
          },
        });
        return;
      }

      ops.enqueueVoiceToolCalls(event.calls);
      return;
    }

    case 'turn-complete':
      resetAssistantTextFallback(context);
      if (!ops.hasOpenVoiceTurnFence()) {
        emitDiagnostic(context, {
          scope: 'voice-session',
          name: 'ignored turn-complete without an open turn fence',
          data: {
            ...buildIgnoredAssistantOutputDetail(context, 'turn-complete', 'no-open-turn-fence'),
            hasOpenVoiceTurnFence: false,
            hasPendingVoiceToolCall: ops.hasPendingVoiceToolCall(),
          },
        });
        return;
      }

      if (shouldIgnoreCanonicalAssistantOutput(context, 'turn-complete')) {
        return;
      }

      ops.completeAssistantDraft();
      ops.finalizeCurrentVoiceTurns('completed');
      ops.attachCurrentAssistantTurn(ops.commitAssistantDraft());
      const turnCompleteEvent = ops.deriveTurnCompleteEvent();

      if (turnCompleteEvent) {
        ops.recordSessionEvent(turnCompleteEvent);
      }
      return;

    default:
      return;
  }
}
