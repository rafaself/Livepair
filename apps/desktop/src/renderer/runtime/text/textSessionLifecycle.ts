import type {
  SessionPhase,
  TextSessionLifecycle,
  TextSessionStatus,
  TransportConnectionState,
} from '../core/types';

export type TextSessionLifecycleEvent =
  | { type: 'bootstrap.started' }
  | { type: 'transport.connected' }
  | { type: 'submit.started' }
  | { type: 'response.delta.received' }
  | { type: 'response.generation.completed' }
  | { type: 'response.interrupted' }
  | { type: 'response.turn.completed' }
  | { type: 'go-away.received' }
  | { type: 'disconnect.requested' }
  | { type: 'transport.disconnected' }
  | { type: 'runtime.failed' }
  | { type: 'session.reset' };

export function createTextSessionLifecycle(
  status: TextSessionStatus = 'idle',
): TextSessionLifecycle {
  return { status };
}

export function reduceTextSessionLifecycle(
  lifecycle: TextSessionLifecycle,
  event: TextSessionLifecycleEvent,
): TextSessionLifecycle {
  switch (event.type) {
    case 'session.reset':
      return createTextSessionLifecycle('idle');
    case 'bootstrap.started':
      return createTextSessionLifecycle('connecting');
    case 'transport.connected':
      return lifecycle.status === 'connecting'
        ? createTextSessionLifecycle('ready')
        : lifecycle;
    case 'submit.started':
      return lifecycle.status === 'ready' || lifecycle.status === 'completed'
        ? createTextSessionLifecycle('sending')
        : lifecycle;
    case 'response.delta.received':
      return lifecycle.status === 'sending' || lifecycle.status === 'receiving'
        ? createTextSessionLifecycle('receiving')
        : lifecycle;
    case 'response.generation.completed':
      return lifecycle.status === 'sending' || lifecycle.status === 'receiving'
        ? createTextSessionLifecycle('generationCompleted')
        : lifecycle;
    case 'response.interrupted':
      return lifecycle.status === 'sending' ||
        lifecycle.status === 'receiving' ||
        lifecycle.status === 'generationCompleted'
        ? createTextSessionLifecycle('interrupted')
        : lifecycle;
    case 'response.turn.completed':
      return lifecycle.status === 'sending' ||
        lifecycle.status === 'receiving' ||
        lifecycle.status === 'generationCompleted' ||
        lifecycle.status === 'interrupted'
        ? createTextSessionLifecycle('completed')
        : lifecycle;
    case 'go-away.received':
      return lifecycle.status === 'disconnecting' || lifecycle.status === 'disconnected'
        ? lifecycle
        : createTextSessionLifecycle('goAway');
    case 'disconnect.requested':
      return lifecycle.status === 'idle' || lifecycle.status === 'disconnected'
        ? createTextSessionLifecycle('disconnected')
        : createTextSessionLifecycle('disconnecting');
    case 'transport.disconnected':
      return lifecycle.status === 'goAway' || lifecycle.status === 'error'
        ? lifecycle
        : createTextSessionLifecycle('disconnected');
    case 'runtime.failed':
      return lifecycle.status === 'goAway' || lifecycle.status === 'disconnected'
        ? lifecycle
        : createTextSessionLifecycle('error');
  }
}

export function deriveSessionPhaseFromLifecycle(
  status: TextSessionStatus,
): SessionPhase {
  if (status === 'connecting') {
    return 'starting';
  }

  if (status === 'disconnecting') {
    return 'ending';
  }

  if (status === 'error' || status === 'goAway') {
    return 'error';
  }

  if (status === 'idle' || status === 'disconnected') {
    return 'idle';
  }

  return 'active';
}

export function deriveTransportStateFromLifecycle(
  status: TextSessionStatus,
): TransportConnectionState {
  if (status === 'connecting') {
    return 'connecting';
  }

  if (status === 'disconnecting') {
    return 'disconnecting';
  }

  if (status === 'error') {
    return 'error';
  }

  if (status === 'idle' || status === 'disconnected' || status === 'goAway') {
    return 'idle';
  }

  return 'connected';
}

export function isTextSessionConnectable(status: TextSessionStatus): boolean {
  return (
    status === 'idle' ||
    status === 'disconnected' ||
    status === 'error' ||
    status === 'goAway'
  );
}

export function isTextTurnInFlight(status: TextSessionStatus): boolean {
  return (
    status === 'connecting' ||
    status === 'sending' ||
    status === 'receiving' ||
    status === 'generationCompleted' ||
    status === 'interrupted' ||
    status === 'disconnecting'
  );
}

export function isSessionActiveLifecycle(status: TextSessionStatus): boolean {
  return !(
    status === 'idle' ||
    status === 'disconnected' ||
    status === 'goAway' ||
    status === 'error'
  );
}
