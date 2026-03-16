import type { SessionPhase } from '../core/session.types';
import type { TransportConnectionState } from '../transport/transport.types';
import type {
  TextSessionLifecycle,
  TextSessionStatus,
} from './text.types';

export function createTextSessionLifecycle(
  status: TextSessionStatus = 'idle',
): TextSessionLifecycle {
  return { status };
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
