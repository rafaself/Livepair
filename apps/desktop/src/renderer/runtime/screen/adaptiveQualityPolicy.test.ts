import { describe, expect, it } from 'vitest';
import {
  createAdaptiveQualityPolicy,
  QUALITY_PROMOTION_DURATION_MS,
} from './adaptiveQualityPolicy';
import { getScreenCaptureQualityParams } from './screenCapturePolicy';

const LOW_PARAMS = getScreenCaptureQualityParams('Low');
const MEDIUM_PARAMS = getScreenCaptureQualityParams('Medium');
const HIGH_PARAMS = getScreenCaptureQualityParams('High');

describe('createAdaptiveQualityPolicy', () => {
  // ── Baseline behaviour ──────────────────────────────────────────────────

  it('returns baseline params when no promotion is active', () => {
    const policy = createAdaptiveQualityPolicy('Medium');
    expect(policy.getEffectiveParams()).toEqual(MEDIUM_PARAMS);
    expect(policy.getBaselineParams()).toEqual(MEDIUM_PARAMS);
  });

  it('reports not promoted initially', () => {
    const policy = createAdaptiveQualityPolicy('Low');
    expect(policy.isPromoted()).toBe(false);
  });

  // ── Promotion from Low ──────────────────────────────────────────────────

  it('promotes effective params to High when baseline is Low', () => {
    const policy = createAdaptiveQualityPolicy('Low');
    policy.promote();
    expect(policy.isPromoted()).toBe(true);
    expect(policy.getEffectiveParams()).toEqual(HIGH_PARAMS);
  });

  it('keeps baseline unchanged after promotion from Low', () => {
    const policy = createAdaptiveQualityPolicy('Low');
    policy.promote();
    expect(policy.getBaselineParams()).toEqual(LOW_PARAMS);
  });

  // ── Promotion from Medium ───────────────────────────────────────────────

  it('promotes effective params to High when baseline is Medium', () => {
    const policy = createAdaptiveQualityPolicy('Medium');
    policy.promote();
    expect(policy.isPromoted()).toBe(true);
    expect(policy.getEffectiveParams()).toEqual(HIGH_PARAMS);
  });

  it('keeps baseline unchanged after promotion from Medium', () => {
    const policy = createAdaptiveQualityPolicy('Medium');
    policy.promote();
    expect(policy.getBaselineParams()).toEqual(MEDIUM_PARAMS);
  });

  // ── Promotion is a no-op when baseline is High ──────────────────────────

  it('does not promote when baseline is already High', () => {
    const policy = createAdaptiveQualityPolicy('High');
    policy.promote();
    expect(policy.isPromoted()).toBe(false);
    expect(policy.getEffectiveParams()).toEqual(HIGH_PARAMS);
  });

  // ── endPromotion ────────────────────────────────────────────────────────

  it('returns to baseline after endPromotion', () => {
    const policy = createAdaptiveQualityPolicy('Low');
    policy.promote();
    expect(policy.isPromoted()).toBe(true);

    policy.endPromotion();
    expect(policy.isPromoted()).toBe(false);
    expect(policy.getEffectiveParams()).toEqual(LOW_PARAMS);
  });

  it('endPromotion is safe to call when not promoted', () => {
    const policy = createAdaptiveQualityPolicy('Medium');
    policy.endPromotion();
    expect(policy.isPromoted()).toBe(false);
    expect(policy.getEffectiveParams()).toEqual(MEDIUM_PARAMS);
  });

  // ── reset ───────────────────────────────────────────────────────────────

  it('reset clears active promotion', () => {
    const policy = createAdaptiveQualityPolicy('Low');
    policy.promote();
    expect(policy.isPromoted()).toBe(true);

    policy.reset();
    expect(policy.isPromoted()).toBe(false);
    expect(policy.getEffectiveParams()).toEqual(LOW_PARAMS);
  });

  it('reset is safe to call when not promoted', () => {
    const policy = createAdaptiveQualityPolicy('Medium');
    policy.reset();
    expect(policy.isPromoted()).toBe(false);
    expect(policy.getEffectiveParams()).toEqual(MEDIUM_PARAMS);
  });

  // ── Re-promotion after endPromotion/reset ───────────────────────────────

  it('can be promoted again after endPromotion', () => {
    const policy = createAdaptiveQualityPolicy('Low');
    policy.promote();
    policy.endPromotion();
    policy.promote();
    expect(policy.isPromoted()).toBe(true);
    expect(policy.getEffectiveParams()).toEqual(HIGH_PARAMS);
  });

  it('can be promoted again after reset', () => {
    const policy = createAdaptiveQualityPolicy('Medium');
    policy.promote();
    policy.reset();
    policy.promote();
    expect(policy.isPromoted()).toBe(true);
    expect(policy.getEffectiveParams()).toEqual(HIGH_PARAMS);
  });

  // ── Repeated promote calls ──────────────────────────────────────────────

  it('repeated promote calls are idempotent', () => {
    const policy = createAdaptiveQualityPolicy('Low');
    policy.promote();
    policy.promote();
    policy.promote();
    expect(policy.isPromoted()).toBe(true);
    expect(policy.getEffectiveParams()).toEqual(HIGH_PARAMS);

    policy.endPromotion();
    expect(policy.isPromoted()).toBe(false);
  });

  // ── Exported constant ──────────────────────────────────────────────────

  it('exports QUALITY_PROMOTION_DURATION_MS as 10 seconds', () => {
    expect(QUALITY_PROMOTION_DURATION_MS).toBe(10_000);
  });

  // ── Options ─────────────────────────────────────────────────────────────

  it('accepts custom promotionDurationMs without affecting core logic', () => {
    const policy = createAdaptiveQualityPolicy('Low', {
      promotionDurationMs: 5_000,
    });
    policy.promote();
    expect(policy.isPromoted()).toBe(true);
    expect(policy.getEffectiveParams()).toEqual(HIGH_PARAMS);
  });
});
