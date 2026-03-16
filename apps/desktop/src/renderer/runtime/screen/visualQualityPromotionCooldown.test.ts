import { describe, expect, it } from 'vitest';
import {
  createVisualQualityPromoter,
  PROMOTED_VISUAL_QUALITY,
} from './visualQualityPromotion';

// ---------------------------------------------------------------------------
// Wave 7 – Promotion Oscillation Guard
//
// Under noisy trigger conditions a caller might call beginFocusedAnalysis /
// endFocusedAnalysis many times in rapid succession, causing the effective
// quality to oscillate between baseline and High on every tick.
//
// The guard adds a minimum hold-down period (VISUAL_PROMOTION_HOLD_MS,
// default 2 000 ms) between successive *begin* calls that would otherwise
// flip promotion on and off.  Specifically:
//
//   - The first beginFocusedAnalysis() always activates promotion (no prior
//     session exists yet, so there is nothing to guard).
//   - A subsequent beginFocusedAnalysis() within VISUAL_PROMOTION_HOLD_MS
//     of the *previous begin* is silently a no-op when a promotion was just
//     ended by endFocusedAnalysis().
//   - After VISUAL_PROMOTION_HOLD_MS has elapsed, beginFocusedAnalysis()
//     activates promotion normally again.
//   - endFocusedAnalysis() always clears immediately; the hold only gates
//     re-activation, not de-activation.
//   - Non-text-heavy intents are not affected (they never promote anyway).
//   - A clock injector (nowMs option) keeps tests deterministic.
// ---------------------------------------------------------------------------

describe('Wave 7 – promotion oscillation guard: basic hold-down', () => {
  it('first beginFocusedAnalysis always activates promotion', () => {
    const now = 0;
    const promoter = createVisualQualityPromoter({ nowMs: () => now });
    promoter.beginFocusedAnalysis('ide_code_analysis');
    expect(promoter.isPromotionActive()).toBe(true);
  });

  it('beginFocusedAnalysis within hold period after end is ignored', () => {
    let now = 0;
    const promoter = createVisualQualityPromoter({ nowMs: () => now });
    promoter.beginFocusedAnalysis('ide_code_analysis');
    promoter.endFocusedAnalysis();

    now += 500; // within hold period
    promoter.beginFocusedAnalysis('ide_code_analysis');
    expect(promoter.isPromotionActive()).toBe(false);
  });

  it('beginFocusedAnalysis after hold period has elapsed activates promotion', () => {
    let now = 0;
    const promoter = createVisualQualityPromoter({ nowMs: () => now });
    promoter.beginFocusedAnalysis('ide_code_analysis');
    promoter.endFocusedAnalysis();

    now += 2000; // exactly at hold period boundary
    promoter.beginFocusedAnalysis('ide_code_analysis');
    expect(promoter.isPromotionActive()).toBe(true);
  });

  it('hold period boundary: one ms short is still suppressed', () => {
    let now = 0;
    const promoter = createVisualQualityPromoter({ nowMs: () => now });
    promoter.beginFocusedAnalysis('ide_code_analysis');
    promoter.endFocusedAnalysis();

    now += 1999;
    promoter.beginFocusedAnalysis('ide_code_analysis');
    expect(promoter.isPromotionActive()).toBe(false);
  });
});

describe('Wave 7 – promotion oscillation guard: repeated cycles', () => {
  it('rapid on/off cycles within hold period stabilize to off', () => {
    let now = 0;
    const promoter = createVisualQualityPromoter({ nowMs: () => now });

    // First activation
    promoter.beginFocusedAnalysis('terminal_log_reading');
    expect(promoter.isPromotionActive()).toBe(true);
    promoter.endFocusedAnalysis();

    // Rapid re-activations within hold period — all should be no-ops
    for (let i = 0; i < 5; i++) {
      now += 100;
      promoter.beginFocusedAnalysis('terminal_log_reading');
      promoter.endFocusedAnalysis();
    }

    // End state: not active (last end cleared it, re-begins were no-ops)
    expect(promoter.isPromotionActive()).toBe(false);
    expect(promoter.getEffectiveQuality('low')).toBe('low');
  });

  it('second activation after hold period works normally', () => {
    let now = 0;
    const promoter = createVisualQualityPromoter({ nowMs: () => now });

    // Cycle 1
    promoter.beginFocusedAnalysis('ide_code_analysis');
    expect(promoter.getEffectiveQuality('low')).toBe(PROMOTED_VISUAL_QUALITY);
    promoter.endFocusedAnalysis();
    expect(promoter.getEffectiveQuality('low')).toBe('low');

    // Wait past hold
    now += 2000;

    // Cycle 2 — full promotion again
    promoter.beginFocusedAnalysis('ide_code_analysis');
    expect(promoter.isPromotionActive()).toBe(true);
    expect(promoter.getEffectiveQuality('low')).toBe(PROMOTED_VISUAL_QUALITY);
    promoter.endFocusedAnalysis();
    expect(promoter.getEffectiveQuality('low')).toBe('low');
  });

  it('10 rapid cycles only promote twice (once at start, once after hold)', () => {
    let now = 0;
    const promoter = createVisualQualityPromoter({ nowMs: () => now });

    let activationCount = 0;
    for (let i = 0; i < 10; i++) {
      now += 300; // 300 ms apart — well within 2 s hold
      promoter.beginFocusedAnalysis('ocr_ui_inspection');
      if (promoter.isPromotionActive()) {
        activationCount++;
      }
      promoter.endFocusedAnalysis();
    }

    // Only the first invocation (at 300 ms) should have activated (i=0).
    // All subsequent ones within the hold period are no-ops.
    // Total elapsed: 10 * 300 = 3000 ms.  The hold is 2000 ms, so at i=7
    // (2100 ms elapsed) we'd cross the boundary and re-activate.
    // That gives 2 activations: i=0 and i=7.
    expect(activationCount).toBe(2);
  });
});

describe('Wave 7 – promotion oscillation guard: endFocusedAnalysis still immediate', () => {
  it('endFocusedAnalysis clears immediately regardless of hold period', () => {
    const now = 0;
    const promoter = createVisualQualityPromoter({ nowMs: () => now });
    promoter.beginFocusedAnalysis('dense_error_screen');
    expect(promoter.isPromotionActive()).toBe(true);

    promoter.endFocusedAnalysis();
    expect(promoter.isPromotionActive()).toBe(false);
    // No time has elapsed; clear is immediate
    expect(now).toBe(0);
  });
});

describe('Wave 7 – promotion oscillation guard: no-options fallback', () => {
  it('createVisualQualityPromoter() works with no options (real clock)', () => {
    const promoter = createVisualQualityPromoter();
    promoter.beginFocusedAnalysis('ide_code_analysis');
    expect(promoter.isPromotionActive()).toBe(true);
    promoter.endFocusedAnalysis();
    expect(promoter.isPromotionActive()).toBe(false);
  });
});

describe('Wave 7 – promotion oscillation guard: non-regression', () => {
  it('non-text-heavy intents are not affected by the hold period', () => {
    let now = 0;
    const promoter = createVisualQualityPromoter({ nowMs: () => now });
    // begin/end with non-text-heavy — no promotion ever; hold irrelevant
    promoter.beginFocusedAnalysis('generic_screenshot');
    promoter.endFocusedAnalysis();
    now += 100; // within hold period
    promoter.beginFocusedAnalysis('generic_screenshot');
    expect(promoter.isPromotionActive()).toBe(false);
    expect(promoter.getEffectiveQuality('medium')).toBe('medium');
  });

  it('Wave 6 baseline-immutability invariant is preserved with oscillation guard', () => {
    const now = 0;
    const baseline = 'low' as const;
    const promoter = createVisualQualityPromoter({ nowMs: () => now });
    promoter.beginFocusedAnalysis('ide_code_analysis');
    expect(promoter.getEffectiveQuality(baseline)).toBe(PROMOTED_VISUAL_QUALITY);
    promoter.endFocusedAnalysis();
    expect(baseline).toBe('low'); // never mutated
    expect(promoter.getEffectiveQuality(baseline)).toBe('low');
  });

  it('Wave 5 mapping invariant is untouched', async () => {
    const { continuousScreenQualityToMediaResolution } = await import(
      '../transport/continuousScreenQuality'
    );
    expect(continuousScreenQualityToMediaResolution('high')).toBe('MEDIA_RESOLUTION_HIGH');
    expect(continuousScreenQualityToMediaResolution('low')).toBe('MEDIA_RESOLUTION_LOW');
  });
});
