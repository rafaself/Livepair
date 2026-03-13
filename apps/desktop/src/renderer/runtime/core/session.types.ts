import type { TransportKind, LiveSessionEvent } from '../transport/transport.types';

export type SessionMode = 'text' | 'voice';
export type ProductMode = 'inactive' | 'speech';
export type SessionPhase = 'idle' | 'starting' | 'active' | 'ending' | 'error';

export type AssistantActivityState = 'idle' | 'listening' | 'thinking' | 'speaking';

export type SessionControllerEvent =
  | { type: 'session.backend.health.started' }
  | { type: 'session.backend.health.succeeded' }
  | { type: 'session.backend.health.failed'; detail: string }
  | { type: 'session.start.requested'; transport: TransportKind }
  | { type: 'session.token.request.started' }
  | { type: 'session.token.request.succeeded'; transport: TransportKind }
  | { type: 'session.token.request.failed'; detail: string }
  | { type: 'session.end.requested' }
  | { type: 'session.ended' }
  | { type: 'session.debug.state.set'; detail: string };

export type RuntimeDebugEvent = {
  scope: 'session' | 'transport';
  type: string;
  at: string;
  detail?: string | undefined;
};

export type RuntimeLogger = {
  onSessionEvent: (event: SessionControllerEvent) => void;
  onTransportEvent: (event: LiveSessionEvent) => void;
};
