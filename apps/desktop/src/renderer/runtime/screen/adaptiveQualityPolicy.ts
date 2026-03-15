/**
 * Adaptive quality policy for screen capture delivery.
 *
 * Treats the user's quality menu selection as the baseline preference.
 * The policy can temporarily promote quality to High for visually demanding
 * moments (analyze, speech trigger, text trigger, bootstrap) and
 * automatically returns to baseline after promotion expires.
 *
 * When the baseline is already High, promotion is a no-op.
 */

import type { VisualSessionQuality } from '../../../shared/settings';
import {
  getScreenCaptureQualityParams,
  type ScreenCaptureQualityParams,
} from './screenCapturePolicy';

/** How long quality stays promoted after a trigger, in milliseconds. */
export const QUALITY_PROMOTION_DURATION_MS = 10_000;

export type AdaptiveQualityPolicy = {
  /** Returns the current effective capture parameters (baseline or promoted). */
  getEffectiveParams(): ScreenCaptureQualityParams;
  /** Returns the baseline capture parameters (user's quality setting). */
  getBaselineParams(): ScreenCaptureQualityParams;
  /** Returns true when quality is actively promoted above baseline. */
  isPromoted(): boolean;
  /** Promote quality to High. No-op if baseline is already High. */
  promote(): void;
  /** End promotion immediately (return to baseline). */
  endPromotion(): void;
  /** Reset all state (e.g. on screen share stop). */
  reset(): void;
};

export type AdaptiveQualityPolicyOptions = {
  promotionDurationMs?: number;
};

export function createAdaptiveQualityPolicy(
  baseline: VisualSessionQuality,
  options?: AdaptiveQualityPolicyOptions,
): AdaptiveQualityPolicy {
  const baselineParams = getScreenCaptureQualityParams(baseline);
  const promotedParams = getScreenCaptureQualityParams('High');
  const alreadyMax = baseline === 'High';

  let promoted = false;

  return {
    getEffectiveParams: () =>
      promoted && !alreadyMax ? promotedParams : baselineParams,

    getBaselineParams: () => baselineParams,

    isPromoted: () => promoted && !alreadyMax,

    promote() {
      if (alreadyMax) return;
      promoted = true;
    },

    endPromotion() {
      promoted = false;
    },

    reset() {
      promoted = false;
    },
  };
}
