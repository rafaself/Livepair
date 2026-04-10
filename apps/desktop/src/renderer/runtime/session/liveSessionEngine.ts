import type { SessionCommand, SessionEvent } from '../core/session.types';
import {
  createSpeechSessionLifecycle,
  isSpeechLifecycleActive,
  reduceSpeechSessionLifecycle,
  type SpeechSessionLifecycleEvent,
} from '../speech/speechSessionLifecycle';
import type { SpeechLifecycle } from '../speech/speech.types';
import type { VoiceSessionStatus } from '../voice/voice.types';
import { isAssistantTurnUnavailable } from '../transport/transportEventGating';

type AssistantOutputEventType =
  | 'text-delta'
  | 'output-transcript'
  | 'audio-chunk'
  | 'turn-complete';

export type LiveSessionEngineState = {
  speechLifecycle: SpeechLifecycle;
  voiceSessionStatus: VoiceSessionStatus;
};

export type LiveSessionCommandDecision =
  | { accepted: true }
  | { accepted: false; reason: 'session-already-active' | 'speech-inactive' };

export type LiveSessionEngineEventTransition = {
  event: SessionEvent;
  previousState: LiveSessionEngineState;
  nextState: LiveSessionEngineState;
  speechLifecycleEvent: SpeechSessionLifecycleEvent | null;
};

export type AssistantOutputDecision =
  | { ignore: false }
  | { ignore: true; reason: 'turn-unavailable' };

function mapSessionEventToSpeechLifecycleEvent(
  event: SessionEvent,
): SpeechSessionLifecycleEvent | null {
  switch (event.type) {
    case 'session.start.requested':
      return { type: 'session.start.requested' };
    case 'session.ready':
      return { type: 'session.ready' };
    case 'turn.user.speech.detected':
      return { type: 'user.speech.detected' };
    case 'turn.user.settled':
      return { type: 'user.turn.settled' };
    case 'turn.assistant.output.started':
      return { type: 'assistant.output.started' };
    case 'turn.assistantCompleted':
      return { type: 'assistant.turn.completed' };
    case 'turn.interrupted':
      return { type: 'interruption.detected' };
    case 'turn.recovery.started':
      return { type: 'recovery.started' };
    case 'turn.recovery.completed':
      return { type: 'recovery.completed' };
    case 'session.end.requested':
      return { type: 'session.end.requested' };
    case 'session.ended':
      return { type: 'session.ended' };
    default:
      return null;
  }
}

function reduceVoiceSessionStatus(
  currentStatus: VoiceSessionStatus,
  event: SessionEvent,
): VoiceSessionStatus {
  switch (event.type) {
    case 'session.start.requested':
      return 'connecting';
    case 'transport.connecting':
      return event.resuming ? 'recovering' : 'connecting';
    case 'transport.connected':
      return 'active';
    case 'turn.interrupted':
      return 'interrupted';
    case 'turn.recovery.started':
      return currentStatus === 'interrupted' ? 'recovering' : currentStatus;
    case 'turn.recovery.completed':
      return currentStatus === 'interrupted' || currentStatus === 'recovering'
        ? 'active'
        : currentStatus;
    case 'session.end.requested':
      return currentStatus === 'disconnected' || currentStatus === 'error'
        ? currentStatus
        : 'stopping';
    case 'session.ended':
    case 'transport.disconnected':
      return 'disconnected';
    case 'session.error':
    case 'transport.error':
    case 'transport.audioError':
      return 'error';
    default:
      return currentStatus;
  }
}

function reduceLiveSessionEngineState(
  state: LiveSessionEngineState,
  event: SessionEvent,
): LiveSessionEngineEventTransition {
  const speechLifecycleEvent = mapSessionEventToSpeechLifecycleEvent(event);

  return {
    event,
    previousState: state,
    nextState: {
      speechLifecycle: speechLifecycleEvent
        ? reduceSpeechSessionLifecycle(state.speechLifecycle, speechLifecycleEvent)
        : state.speechLifecycle,
      voiceSessionStatus: reduceVoiceSessionStatus(state.voiceSessionStatus, event),
    },
    speechLifecycleEvent,
  };
}

export function createLiveSessionEngine(
  initialState: LiveSessionEngineState = {
    speechLifecycle: createSpeechSessionLifecycle(),
    voiceSessionStatus: 'disconnected',
  },
) {
  let state = initialState;

  return {
    getState: (): LiveSessionEngineState => state,
    handleCommand: (command: SessionCommand): LiveSessionCommandDecision => {
      switch (command.type) {
        case 'session.start':
          return state.voiceSessionStatus === 'disconnected' || state.voiceSessionStatus === 'error'
            ? { accepted: true }
            : { accepted: false, reason: 'session-already-active' };
        case 'textTurn.submit':
          return isSpeechLifecycleActive(state.speechLifecycle.status)
            ? { accepted: true }
            : { accepted: false, reason: 'speech-inactive' };
        default:
          return { accepted: true };
      }
    },
    applyEvent: (event: SessionEvent): LiveSessionEngineEventTransition => {
      const transition = reduceLiveSessionEngineState(state, event);
      state = transition.nextState;
      return transition;
    },
    shouldIgnoreAssistantOutput: (
      eventType: AssistantOutputEventType,
      {
        hasQueuedMixedModeAssistantReply,
        hasStreamingAssistantVoiceTurn,
      }: {
        hasQueuedMixedModeAssistantReply: boolean;
        hasStreamingAssistantVoiceTurn: boolean;
      },
    ): AssistantOutputDecision => {
      if (!isAssistantTurnUnavailable(state.voiceSessionStatus)) {
        return { ignore: false };
      }

      const canContinueUnavailableTurn =
        eventType === 'turn-complete'
          ? hasStreamingAssistantVoiceTurn
          : hasQueuedMixedModeAssistantReply || hasStreamingAssistantVoiceTurn;

      return canContinueUnavailableTurn
        ? { ignore: false }
        : { ignore: true, reason: 'turn-unavailable' };
    },
    deriveTurnCompleteEvent: (): Extract<
      SessionEvent,
      { type: 'turn.assistantCompleted' } | { type: 'turn.user.settled' }
    > | null => {
      if (state.speechLifecycle.status === 'assistantSpeaking') {
        return { type: 'turn.assistantCompleted' };
      }

      if (state.speechLifecycle.status === 'userSpeaking') {
        return { type: 'turn.user.settled' };
      }

      return null;
    },
  };
}
