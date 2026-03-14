/**
 * Wave 6 – Contextual Visual Quality Promotion
 *
 * Temporarily raises the model-side visual session quality (mediaResolution)
 * only when a screen-analysis task genuinely needs finer detail, then reverts
 * to the user-selected baseline automatically.
 *
 * Design principles
 * ─────────────────
 * - Promotion is a *temporary override layer*. It never mutates DesktopSettings
 *   or any stored preference; the caller always supplies the baseline.
 * - Trigger detection is an explicit allowlist of known text-heavy intents.
 *   No heuristics, no ML, no semantic scene analysis.
 * - The end condition is explicit: `endFocusedAnalysis()`. The natural end
 *   point is snapshot consumed → sleep (Wave 1 state machine), so the caller
 *   should call endFocusedAnalysis() immediately after the analysis completes.
 * - The fixed Live model (Wave 4) and local frame encoding constants (Wave 4)
 *   are completely unrelated to this module.
 *
 * Wave 7 – Promotion Oscillation Guard
 * ──────────────────────────────────────
 * Under noisy trigger conditions a caller may call beginFocusedAnalysis /
 * endFocusedAnalysis many times in rapid succession, causing the effective
 * quality to oscillate on every tick.  A minimum hold-down period
 * (VISUAL_PROMOTION_HOLD_MS, default 2 000 ms) is enforced between successive
 * *begin* calls after a prior promotion was ended.  endFocusedAnalysis() still
 * clears immediately; only re-activation is gated.
 * The clock is injectable via options for deterministic tests.
 */

import type { VisualSessionQuality } from '../../../shared/settings';

// ---------------------------------------------------------------------------
// Intent taxonomy
// ---------------------------------------------------------------------------

/**
 * Explicit set of screen-analysis intents known to require fine text detail.
 * Extend here (and update tests) to add new triggers — never use an open-ended
 * heuristic.
 */
export const TEXT_HEAVY_VISUAL_INTENTS = [
  'ide_code_analysis',
  'terminal_log_reading',
  'ocr_ui_inspection',
  'dense_error_screen',
  'small_text_review',
] as const;

/**
 * Union type of all recognised screen-analysis intent identifiers.
 * Callers may pass any string; only the known text-heavy ones promote quality.
 */
export type VisualAnalysisIntent = (typeof TEXT_HEAVY_VISUAL_INTENTS)[number] | (string & {});

// ---------------------------------------------------------------------------
// Promotion target
// ---------------------------------------------------------------------------

/**
 * The quality level used when promotion is active.
 * Kept as a named constant so it can be asserted in tests and referenced
 * without sprinkling magic strings through call sites.
 */
export const PROMOTED_VISUAL_QUALITY: VisualSessionQuality = 'High';

/**
 * Wave 7 – Minimum hold-down period between successive beginFocusedAnalysis()
 * calls that would re-activate promotion after it was previously ended.
 */
export const VISUAL_PROMOTION_HOLD_MS = 2000;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Returns true only for intents that are in the explicit text-heavy allowlist. */
export function isTextHeavyVisualIntent(intent: VisualAnalysisIntent): boolean {
  return (TEXT_HEAVY_VISUAL_INTENTS as readonly string[]).includes(intent);
}

/**
 * Stateless resolution: given an intent and a baseline quality, return the
 * quality that should be used for the focused analysis.
 *
 * - Text-heavy intent → PROMOTED_VISUAL_QUALITY
 * - Any other intent  → baseline (no promotion)
 */
export function resolvePromotedQuality(
  intent: VisualAnalysisIntent,
  baseline: VisualSessionQuality,
): VisualSessionQuality {
  return isTextHeavyVisualIntent(intent) ? PROMOTED_VISUAL_QUALITY : baseline;
}

// ---------------------------------------------------------------------------
// Stateful promoter
// ---------------------------------------------------------------------------

export type VisualQualityPromoterOptions = {
  /**
   * Wave 7 – injectable clock for deterministic tests.
   * Defaults to () => Date.now().
   */
  nowMs?: () => number;
};

export type VisualQualityPromoter = {
  /**
   * Begin a focused analysis with the given intent.
   * If the intent is text-heavy, activates the quality promotion overlay.
   * If the intent is not text-heavy, clears any prior promotion.
   * Calling this while a promotion is already active replaces it.
   * Wave 7: if the intent is text-heavy but the hold-down period has not
   * elapsed since the last endFocusedAnalysis(), this call is a no-op.
   */
  beginFocusedAnalysis: (intent: VisualAnalysisIntent) => void;
  /**
   * End the focused analysis and clear the promotion overlay.
   * Safe to call even when no promotion is active.
   * Wave 7: records the end timestamp for hold-down tracking.
   */
  endFocusedAnalysis: () => void;
  /**
   * Returns the effective quality to use right now.
   * - During an active promotion: PROMOTED_VISUAL_QUALITY
   * - Otherwise: the supplied baseline (never mutated)
   */
  getEffectiveQuality: (baseline: VisualSessionQuality) => VisualSessionQuality;
  /** True when a text-heavy promotion is currently in force. */
  isPromotionActive: () => boolean;
  /**
   * Returns the intent that triggered the current promotion, or null if no
   * promotion is active. Intended for diagnostics/logging only.
   */
  getActiveIntent: () => VisualAnalysisIntent | null;
};

/**
 * Factory for a stateful quality promoter.
 *
 * Lifecycle per focused analysis:
 *   beginFocusedAnalysis(intent) → [analysis runs] → endFocusedAnalysis()
 *
 * The promoter is intentionally separate from the VisualSendPolicy (Wave 1)
 * so each concern evolves independently.
 */
export function createVisualQualityPromoter(
  options?: VisualQualityPromoterOptions,
): VisualQualityPromoter {
  const nowMs = options?.nowMs ?? (() => Date.now());

  let activeIntent: VisualAnalysisIntent | null = null;

  // Wave 7 – hold-down tracking: timestamp of the last endFocusedAnalysis
  // that cleared a text-heavy promotion.  null = no prior promotion ended.
  let lastPromotionEndedAt: number | null = null;

  function isHoldActive(): boolean {
    if (lastPromotionEndedAt === null) return false;
    return nowMs() - lastPromotionEndedAt < VISUAL_PROMOTION_HOLD_MS;
  }

  return {
    beginFocusedAnalysis(intent: VisualAnalysisIntent): void {
      if (!isTextHeavyVisualIntent(intent)) {
        // Non-text-heavy: clear any prior promotion (Wave 6 behaviour preserved)
        activeIntent = null;
        return;
      }
      // Wave 7: suppress re-activation during hold-down period
      if (isHoldActive()) {
        return;
      }
      activeIntent = intent;
    },

    endFocusedAnalysis(): void {
      if (activeIntent !== null) {
        // Record end time only when a text-heavy promotion was actually active
        lastPromotionEndedAt = nowMs();
      }
      activeIntent = null;
    },

    getEffectiveQuality(baseline: VisualSessionQuality): VisualSessionQuality {
      return activeIntent !== null ? PROMOTED_VISUAL_QUALITY : baseline;
    },

    isPromotionActive(): boolean {
      return activeIntent !== null;
    },

    getActiveIntent(): VisualAnalysisIntent | null {
      return activeIntent;
    },
  };
}
