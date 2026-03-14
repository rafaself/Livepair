/**
 * Wave 7 – Visual Quality Fallback Tracker
 *
 * When a contextual quality promotion cannot take effect immediately
 * (e.g. no active Live session, or the session does not support mid-session
 * resolution changes), the system must not silently lose the intent.
 * Instead it records the fallback reason explicitly so the caller can:
 *   a) surface a lightweight status message to the user, and
 *   b) diagnose what happened.
 *
 * Design
 * ──────
 * - Pure value object + factory; no side effects, no timers, no I/O.
 * - `recordFallback(reason)` stores the most recent reason.
 * - `getFallbackReason()` returns the stored reason, or null if none.
 * - `hasFallback()` is a convenience predicate.
 * - `clearFallback()` resets to null (called after successful application).
 * - Known reasons are exported as a const map so callers never use magic strings.
 * - This module is intentionally separate from VisualQualityPromoter (Wave 6)
 *   and VisualSendPolicy (Wave 1); each concern evolves independently.
 */

// ---------------------------------------------------------------------------
// Known fallback reasons
// ---------------------------------------------------------------------------

/**
 * All known reasons a quality change may not take effect immediately.
 * Use these constants instead of raw string literals at call sites.
 */
export const VISUAL_QUALITY_FALLBACK_REASON = {
  /** No Gemini Live session is currently active; quality override cannot be applied. */
  no_active_session: 'no_active_session',
  /**
   * The active session was established before the promotion was requested and
   * does not support mid-session resolution changes.
   */
  session_does_not_support_mid_session_quality_change:
    'session_does_not_support_mid_session_quality_change',
} as const;

export type VisualQualityFallbackReason =
  (typeof VISUAL_QUALITY_FALLBACK_REASON)[keyof typeof VISUAL_QUALITY_FALLBACK_REASON];

// ---------------------------------------------------------------------------
// Tracker
// ---------------------------------------------------------------------------

export type VisualQualityFallbackTracker = {
  /**
   * Record that a quality change could not be applied for the given reason.
   * Replaces any previously recorded reason.
   */
  recordFallback: (reason: VisualQualityFallbackReason) => void;
  /**
   * Returns the most recently recorded fallback reason, or null if none.
   */
  getFallbackReason: () => VisualQualityFallbackReason | null;
  /** True when a fallback reason has been recorded and not yet cleared. */
  hasFallback: () => boolean;
  /**
   * Clears the recorded fallback reason.
   * Call this after the quality change has been successfully applied
   * (e.g. on next session connect with the promoted quality).
   * Safe to call when no fallback is recorded.
   */
  clearFallback: () => void;
};

export function createVisualQualityFallbackTracker(): VisualQualityFallbackTracker {
  let reason: VisualQualityFallbackReason | null = null;

  return {
    recordFallback(r: VisualQualityFallbackReason): void {
      reason = r;
    },

    getFallbackReason(): VisualQualityFallbackReason | null {
      return reason;
    },

    hasFallback(): boolean {
      return reason !== null;
    },

    clearFallback(): void {
      reason = null;
    },
  };
}
