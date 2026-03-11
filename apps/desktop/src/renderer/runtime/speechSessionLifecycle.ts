import type {
  SpeechLifecycle,
  SpeechLifecycleStatus,
} from './types';

export type SpeechSessionLifecycleEvent =
  | { type: 'session.start.requested' }
  | { type: 'session.ready' }
  | { type: 'user.speech.detected' }
  | { type: 'user.turn.settled' }
  | { type: 'assistant.output.started' }
  | { type: 'assistant.turn.completed' }
  | { type: 'interruption.detected' }
  | { type: 'recovery.started' }
  | { type: 'recovery.completed' }
  | { type: 'session.end.requested' }
  | { type: 'session.ended' };

export function createSpeechSessionLifecycle(
  status: SpeechLifecycleStatus = 'off',
): SpeechLifecycle {
  return { status };
}

export function reduceSpeechSessionLifecycle(
  lifecycle: SpeechLifecycle,
  event: SpeechSessionLifecycleEvent,
): SpeechLifecycle {
  switch (event.type) {
    case 'session.start.requested':
      return lifecycle.status === 'off'
        ? createSpeechSessionLifecycle('starting')
        : lifecycle;
    case 'session.ready':
      return lifecycle.status === 'starting'
        ? createSpeechSessionLifecycle('listening')
        : lifecycle;
    case 'user.speech.detected':
      return lifecycle.status === 'listening' || lifecycle.status === 'recovering'
        ? createSpeechSessionLifecycle('userSpeaking')
        : lifecycle;
    case 'user.turn.settled':
      return lifecycle.status === 'userSpeaking'
        ? createSpeechSessionLifecycle('listening')
        : lifecycle;
    case 'assistant.output.started':
      return lifecycle.status === 'listening' || lifecycle.status === 'userSpeaking'
        ? createSpeechSessionLifecycle('assistantSpeaking')
        : lifecycle;
    case 'assistant.turn.completed':
      return lifecycle.status === 'assistantSpeaking'
        ? createSpeechSessionLifecycle('listening')
        : lifecycle;
    case 'interruption.detected':
      return lifecycle.status === 'assistantSpeaking'
        ? createSpeechSessionLifecycle('interrupted')
        : lifecycle;
    case 'recovery.started':
      return lifecycle.status === 'interrupted'
        ? createSpeechSessionLifecycle('recovering')
        : lifecycle;
    case 'recovery.completed':
      return lifecycle.status === 'interrupted' || lifecycle.status === 'recovering'
        ? createSpeechSessionLifecycle('listening')
        : lifecycle;
    case 'session.end.requested':
      return lifecycle.status === 'off'
        ? lifecycle
        : createSpeechSessionLifecycle('ending');
    case 'session.ended':
      return lifecycle.status === 'ending'
        ? createSpeechSessionLifecycle('off')
        : lifecycle;
  }
}

export function isSpeechLifecycleActive(status: SpeechLifecycleStatus): boolean {
  return status !== 'off';
}
