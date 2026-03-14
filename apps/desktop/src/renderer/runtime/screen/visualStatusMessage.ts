/**
 * Wave 7 – Visual Status Messages
 *
 * Lightweight, pure string constants for surfacing visual-mode transitions
 * to the user or assistant.  No state, no side effects, no I/O.
 *
 * Contexts
 * ────────
 *   'analyzing' – a focused snapshot analysis has just been requested
 *   'following' – continuous streaming mode is active
 *   'stopped'   – visual sharing has ended (screen share off)
 *   'idle'      – screen share is active but no analysis is in progress
 */

export type VisualStatusContext = 'analyzing' | 'following' | 'stopped' | 'idle';

/**
 * Canonical user-facing status strings for each visual context.
 * Exported as a const map so callers can reference them without
 * hard-coding the text.
 */
export const VISUAL_STATUS_MESSAGES: Record<VisualStatusContext, string> = {
  analyzing: "I'm analyzing the screen",
  following: "I'm following along visually",
  stopped: "I stopped watching the screen",
  idle: 'Screen share is active',
} as const;

/**
 * Returns the status message for the given visual context.
 * Equivalent to VISUAL_STATUS_MESSAGES[context] but explicit about the
 * expected return type.
 */
export function getVisualStatusMessage(context: VisualStatusContext): string {
  return VISUAL_STATUS_MESSAGES[context];
}
