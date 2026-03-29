import type { LiveSessionEvent } from '../transport/transport.types';
import type { SessionEvent } from './sessionEvent.types';

export type { SessionCommand } from './sessionCommand.types';
export type { SessionEvent } from './sessionEvent.types';

/**
 * Legacy alias — widened to `SessionEvent` in SR-04.
 *
 * Existing call-sites that construct or accept `SessionControllerEvent`
 * remain valid because every former member is still present in `SessionEvent`.
 * New code should prefer `SessionEvent` directly.
 *
 * @deprecated Use `SessionEvent`.
 */
export type SessionControllerEvent = SessionEvent;

export type LiveConnectMode = 'text' | 'voice';
export type ProductMode = 'inactive' | 'speech';
export type SessionPhase = 'idle' | 'starting' | 'active' | 'ending' | 'error';

export type AssistantActivityState = 'idle' | 'listening' | 'thinking' | 'speaking';

export type RuntimeDebugEvent = {
  scope: 'session' | 'transport';
  type: string;
  at: string;
  detail?: string | undefined;
};

export type RuntimeLogger = {
  onSessionEvent: (event: SessionEvent) => void;
  onTransportEvent: (event: LiveSessionEvent) => void;
};
