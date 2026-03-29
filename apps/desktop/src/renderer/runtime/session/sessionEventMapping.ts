import type { SessionEvent } from '../core/session.types';
import type { SpeechSessionLifecycleEvent } from '../speech/speechSessionLifecycle';

export function mapSessionEventToSpeechLifecycleEvent(
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
    case 'session.end.requested':
      return { type: 'session.end.requested' };
    case 'session.ended':
      return { type: 'session.ended' };
    default:
      return null;
  }
}
