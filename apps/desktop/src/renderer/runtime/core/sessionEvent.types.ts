import type { TransportKind } from '../transport/transport.types';

/**
 * Session event contract — facts and outcomes that have already occurred.
 *
 * Events are the internal vocabulary through which the Live runtime expresses
 * state transitions and outcomes. Each variant represents a single observable
 * fact about session behavior.
 *
 * This union is a superset of the legacy `SessionControllerEvent` type.
 * Transport and turn events are normalized from provider-level
 * `LiveSessionEvent` into this session-level vocabulary by the transport
 * event router.
 *
 * @see SessionCommand for the corresponding intent vocabulary.
 * @internal Introduced in SR-04.
 */
export type SessionEvent =
  // ── Session lifecycle ──
  | { type: 'session.start.requested'; transport: TransportKind }
  | { type: 'session.ready' }
  | { type: 'session.end.requested' }
  | { type: 'session.ended' }
  | { type: 'session.error'; detail: string }
  // ── Backend health ──
  | { type: 'session.backend.health.started' }
  | { type: 'session.backend.health.succeeded' }
  | { type: 'session.backend.health.failed'; detail: string }
  // ── Token ──
  | { type: 'session.token.request.started' }
  | { type: 'session.token.request.succeeded'; transport: TransportKind }
  | { type: 'session.token.request.failed'; detail: string }
  // ── Transport connectivity (normalized from LiveSessionEvent) ──
  | { type: 'transport.connecting'; resuming: boolean }
  | { type: 'transport.connected'; resumed: boolean }
  | { type: 'transport.disconnected' }
  | { type: 'transport.goAway'; detail: string }
  | { type: 'transport.terminated'; detail: string }
  | { type: 'transport.error'; detail: string }
  | { type: 'transport.resumptionUpdated'; handle: string | null; resumable: boolean }
  | { type: 'transport.audioError'; detail: string }
  // ── Turn events (normalized from LiveSessionEvent) ──
  | { type: 'turn.user.speech.detected' }
  | { type: 'turn.user.settled' }
  | { type: 'turn.assistant.output.started' }
  | { type: 'transcript.user.updated'; text: string; isFinal: boolean }
  | { type: 'transcript.assistant.updated'; text: string; isFinal: boolean }
  | { type: 'turn.assistantCompleted' }
  | { type: 'turn.interrupted' }
  | { type: 'turn.recovery.started' }
  | { type: 'turn.recovery.completed' }
  // ── Debug ──
  | { type: 'session.debug.state.set'; detail: string };
