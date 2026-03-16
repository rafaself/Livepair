import { isAssistantTurnUnavailable } from './transportEventGating';
import type { LiveSessionEvent } from './transport.types';
import type { TransportEventRouterContext } from './transportEventRouterTypes';

type CanonicalAssistantOutputEventType = 'text-delta' | 'turn-complete';
type TranscriptOrAudioEventType = 'audio-chunk' | 'output-transcript';

function logIgnoredUnavailableAssistantOutput(
  context: TransportEventRouterContext,
  eventType: CanonicalAssistantOutputEventType | TranscriptOrAudioEventType,
): void {
  context.ops.logRuntimeDiagnostic('voice-session', 'ignored assistant output while turn is unavailable', {
    voiceStatus: context.ops.currentVoiceSessionStatus(),
    eventType,
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

  logIgnoredUnavailableAssistantOutput(context, eventType);
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

  logIgnoredUnavailableAssistantOutput(context, eventType);
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
    eventType,
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
      return;

    case 'input-transcript':
      ops.applySpeechLifecycleEvent({ type: 'user.speech.detected' });
      ops.applyVoiceTranscriptUpdate('user', event.text, event.isFinal);
      return;

    case 'output-transcript':
      if (shouldIgnoreTranscriptOrAudio(context, 'output-transcript')) {
        return;
      }

      if (!ensureAssistantVoiceTurn(context, 'output-transcript')) {
        return;
      }

      ops.applySpeechLifecycleEvent({ type: 'assistant.output.started' });
      ops.applyVoiceTranscriptUpdate('assistant', event.text, event.isFinal);
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
        ops.logRuntimeDiagnostic('voice-session', 'ignored turn-complete without an open turn fence', {});
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
