/**
 * Adaptive quality policy for screen capture delivery.
 *
 * Treats the user's quality menu selection as the baseline preference.
 * The policy can temporarily promote quality to High for detail-sensitive
 * snapshot moments and automatically returns to baseline after the promoted
 * snapshot is consumed or the promotion window expires.
 *
 * When the baseline is already High, promotion is a no-op.
 */

import type { ContinuousScreenQuality } from '../../../shared/settings';
import {
  getScreenCaptureQualityParams,
  type ScreenCaptureQualityParams,
} from './screenCapturePolicy';

/**
 * How long quality may stay promoted without a promoted snapshot dispatch,
 * in milliseconds. This covers the next 1 FPS capture tick with some slack
 * while avoiding long stretches of unnecessary High-quality context frames.
 */
export const QUALITY_PROMOTION_DURATION_MS = 2_500;

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

export function createAdaptiveQualityPolicy(
  baseline: ContinuousScreenQuality,
): AdaptiveQualityPolicy {
  const baselineParams = getScreenCaptureQualityParams(baseline);
  const promotedParams = getScreenCaptureQualityParams('high');
  const alreadyMax = baseline === 'high';

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
