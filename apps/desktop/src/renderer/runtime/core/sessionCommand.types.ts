/**
 * Session command contract — intents to change or advance session behavior.
 *
 * Commands are the internal vocabulary through which the Live runtime public
 * API expresses user and system intents. Each variant represents a single
 * action the runtime can be asked to perform.
 *
 * @see SessionEvent for the corresponding outcome/fact vocabulary.
 * @internal Introduced in SR-04.
 */
export type SessionCommand =
  // ── Session lifecycle ──
  | { type: 'session.start'; mode: 'speech' }
  | { type: 'session.end' }
  | { type: 'speechMode.end' }
  // ── Voice capture ──
  | { type: 'voiceCapture.start' }
  | { type: 'voiceCapture.stop' }
  // ── Screen capture ──
  | { type: 'screenCapture.start' }
  | { type: 'screenCapture.stop' }
  | { type: 'screenCapture.analyzeNow' }
  // ── User interaction ──
  | { type: 'textTurn.submit'; text: string }
  // ── Backend ──
  | { type: 'backend.checkHealth' };
