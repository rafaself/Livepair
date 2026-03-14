import { describe, expect, it } from 'vitest';
import {
  TEXT_HEAVY_VISUAL_INTENTS,
  isTextHeavyVisualIntent,
  resolvePromotedQuality,
  createVisualQualityPromoter,
  PROMOTED_VISUAL_QUALITY,
  type VisualAnalysisIntent,
} from './visualQualityPromotion';

// ---------------------------------------------------------------------------
// Wave 6 – Contextual Visual Quality Promotion
//
// A temporary override layer that raises model-side visual session quality
// only for text-heavy screen-analysis tasks (IDE/code, terminal/log, OCR,
// dense error screens, small-text review).
//
// Invariants:
//   - baseline quality is NEVER mutated
//   - promotion is active only while a focused analysis is in flight
//   - after endFocusedAnalysis() the effective quality reverts to baseline
//   - non-text-heavy intents do NOT trigger promotion
//   - the fixed Live model is not involved here
//   - Wave 4 local encoding constants are not involved here
// ---------------------------------------------------------------------------

describe('TEXT_HEAVY_VISUAL_INTENTS – known trigger set', () => {
  it('includes ide_code_analysis', () => {
    expect(TEXT_HEAVY_VISUAL_INTENTS).toContain('ide_code_analysis');
  });

  it('includes terminal_log_reading', () => {
    expect(TEXT_HEAVY_VISUAL_INTENTS).toContain('terminal_log_reading');
  });

  it('includes ocr_ui_inspection', () => {
    expect(TEXT_HEAVY_VISUAL_INTENTS).toContain('ocr_ui_inspection');
  });

  it('includes dense_error_screen', () => {
    expect(TEXT_HEAVY_VISUAL_INTENTS).toContain('dense_error_screen');
  });

  it('includes small_text_review', () => {
    expect(TEXT_HEAVY_VISUAL_INTENTS).toContain('small_text_review');
  });
});

describe('isTextHeavyVisualIntent', () => {
  it('returns true for ide_code_analysis', () => {
    expect(isTextHeavyVisualIntent('ide_code_analysis')).toBe(true);
  });

  it('returns true for terminal_log_reading', () => {
    expect(isTextHeavyVisualIntent('terminal_log_reading')).toBe(true);
  });

  it('returns true for ocr_ui_inspection', () => {
    expect(isTextHeavyVisualIntent('ocr_ui_inspection')).toBe(true);
  });

  it('returns true for dense_error_screen', () => {
    expect(isTextHeavyVisualIntent('dense_error_screen')).toBe(true);
  });

  it('returns true for small_text_review', () => {
    expect(isTextHeavyVisualIntent('small_text_review')).toBe(true);
  });

  it('returns false for generic_screenshot (non-text-heavy)', () => {
    expect(isTextHeavyVisualIntent('generic_screenshot')).toBe(false);
  });
});

describe('resolvePromotedQuality', () => {
  it('promotes to PROMOTED_VISUAL_QUALITY for a text-heavy intent regardless of baseline', () => {
    expect(resolvePromotedQuality('ide_code_analysis', 'Low')).toBe(PROMOTED_VISUAL_QUALITY);
    expect(resolvePromotedQuality('terminal_log_reading', 'Medium')).toBe(PROMOTED_VISUAL_QUALITY);
    expect(resolvePromotedQuality('ocr_ui_inspection', 'High')).toBe(PROMOTED_VISUAL_QUALITY);
  });

  it('returns baseline for a non-text-heavy intent', () => {
    expect(resolvePromotedQuality('generic_screenshot', 'Low')).toBe('Low');
    expect(resolvePromotedQuality('generic_screenshot', 'Medium')).toBe('Medium');
    expect(resolvePromotedQuality('generic_screenshot', 'High')).toBe('High');
  });

  it('PROMOTED_VISUAL_QUALITY is High', () => {
    expect(PROMOTED_VISUAL_QUALITY).toBe('High');
  });
});

describe('createVisualQualityPromoter – initial state', () => {
  it('has no active promotion by default', () => {
    const promoter = createVisualQualityPromoter();
    expect(promoter.isPromotionActive()).toBe(false);
  });

  it('returns baseline quality when no promotion is active', () => {
    const promoter = createVisualQualityPromoter();
    expect(promoter.getEffectiveQuality('Low')).toBe('Low');
    expect(promoter.getEffectiveQuality('Medium')).toBe('Medium');
    expect(promoter.getEffectiveQuality('High')).toBe('High');
  });
});

describe('createVisualQualityPromoter – text-heavy promotion', () => {
  it('activates promotion for a text-heavy intent', () => {
    const promoter = createVisualQualityPromoter();
    promoter.beginFocusedAnalysis('ide_code_analysis');
    expect(promoter.isPromotionActive()).toBe(true);
  });

  it('returns promoted quality during active promotion', () => {
    const promoter = createVisualQualityPromoter();
    promoter.beginFocusedAnalysis('ide_code_analysis');
    expect(promoter.getEffectiveQuality('Low')).toBe(PROMOTED_VISUAL_QUALITY);
  });

  it('returns promoted quality for all baselines while promotion is active', () => {
    const promoter = createVisualQualityPromoter();
    promoter.beginFocusedAnalysis('terminal_log_reading');
    expect(promoter.getEffectiveQuality('Low')).toBe(PROMOTED_VISUAL_QUALITY);
    expect(promoter.getEffectiveQuality('Medium')).toBe(PROMOTED_VISUAL_QUALITY);
    expect(promoter.getEffectiveQuality('High')).toBe(PROMOTED_VISUAL_QUALITY);
  });

  it('all text-heavy intents trigger promotion', () => {
    for (const intent of TEXT_HEAVY_VISUAL_INTENTS) {
      const promoter = createVisualQualityPromoter();
      promoter.beginFocusedAnalysis(intent);
      expect(promoter.isPromotionActive()).toBe(true);
      expect(promoter.getEffectiveQuality('Low')).toBe(PROMOTED_VISUAL_QUALITY);
    }
  });
});

describe('createVisualQualityPromoter – non-text-heavy intent', () => {
  it('does not activate promotion for a non-text-heavy intent', () => {
    const promoter = createVisualQualityPromoter();
    promoter.beginFocusedAnalysis('generic_screenshot');
    expect(promoter.isPromotionActive()).toBe(false);
  });

  it('returns baseline quality for a non-text-heavy intent', () => {
    const promoter = createVisualQualityPromoter();
    promoter.beginFocusedAnalysis('generic_screenshot');
    expect(promoter.getEffectiveQuality('Low')).toBe('Low');
  });
});

describe('createVisualQualityPromoter – reversion after endFocusedAnalysis', () => {
  it('deactivates promotion after endFocusedAnalysis()', () => {
    const promoter = createVisualQualityPromoter();
    promoter.beginFocusedAnalysis('ide_code_analysis');
    promoter.endFocusedAnalysis();
    expect(promoter.isPromotionActive()).toBe(false);
  });

  it('returns baseline quality after endFocusedAnalysis()', () => {
    const promoter = createVisualQualityPromoter();
    promoter.beginFocusedAnalysis('ide_code_analysis');
    promoter.endFocusedAnalysis();
    expect(promoter.getEffectiveQuality('Low')).toBe('Low');
    expect(promoter.getEffectiveQuality('Medium')).toBe('Medium');
  });

  it('baseline is unchanged after a promotion cycle', () => {
    // Simulate what would happen: baseline comes from DesktopSettings (never mutated)
    const baseline = 'Low' as const;
    const promoter = createVisualQualityPromoter();

    // Before promotion
    expect(promoter.getEffectiveQuality(baseline)).toBe('Low');

    // During promotion
    promoter.beginFocusedAnalysis('dense_error_screen');
    expect(promoter.getEffectiveQuality(baseline)).toBe(PROMOTED_VISUAL_QUALITY);

    // After promotion ends
    promoter.endFocusedAnalysis();
    expect(promoter.getEffectiveQuality(baseline)).toBe('Low');

    // The baseline variable itself is unchanged
    expect(baseline).toBe('Low');
  });

  it('endFocusedAnalysis is a safe no-op when no promotion is active', () => {
    const promoter = createVisualQualityPromoter();
    expect(() => promoter.endFocusedAnalysis()).not.toThrow();
    expect(promoter.isPromotionActive()).toBe(false);
    expect(promoter.getEffectiveQuality('Low')).toBe('Low');
  });

  it('supports multiple promotion cycles', () => {
    const promoter = createVisualQualityPromoter();

    promoter.beginFocusedAnalysis('ide_code_analysis');
    expect(promoter.getEffectiveQuality('Low')).toBe(PROMOTED_VISUAL_QUALITY);
    promoter.endFocusedAnalysis();
    expect(promoter.getEffectiveQuality('Low')).toBe('Low');

    promoter.beginFocusedAnalysis('terminal_log_reading');
    expect(promoter.getEffectiveQuality('Low')).toBe(PROMOTED_VISUAL_QUALITY);
    promoter.endFocusedAnalysis();
    expect(promoter.getEffectiveQuality('Low')).toBe('Low');
  });

  it('a new beginFocusedAnalysis replaces a prior active promotion', () => {
    const promoter = createVisualQualityPromoter();
    promoter.beginFocusedAnalysis('ide_code_analysis');
    // overwrite with another text-heavy intent — still promoted
    promoter.beginFocusedAnalysis('ocr_ui_inspection');
    expect(promoter.isPromotionActive()).toBe(true);
    expect(promoter.getEffectiveQuality('Low')).toBe(PROMOTED_VISUAL_QUALITY);
    promoter.endFocusedAnalysis();
    expect(promoter.isPromotionActive()).toBe(false);
  });

  it('a non-text-heavy beginFocusedAnalysis clears a prior promotion', () => {
    const promoter = createVisualQualityPromoter();
    promoter.beginFocusedAnalysis('ide_code_analysis');
    expect(promoter.isPromotionActive()).toBe(true);
    // non-text-heavy: should clear promotion
    promoter.beginFocusedAnalysis('generic_screenshot');
    expect(promoter.isPromotionActive()).toBe(false);
    expect(promoter.getEffectiveQuality('Low')).toBe('Low');
  });
});

describe('createVisualQualityPromoter – getActiveIntent diagnostics', () => {
  it('returns null when no promotion is active', () => {
    const promoter = createVisualQualityPromoter();
    expect(promoter.getActiveIntent()).toBeNull();
  });

  it('returns the active intent during promotion', () => {
    const promoter = createVisualQualityPromoter();
    promoter.beginFocusedAnalysis('ide_code_analysis');
    expect(promoter.getActiveIntent()).toBe('ide_code_analysis');
  });

  it('returns null after endFocusedAnalysis()', () => {
    const promoter = createVisualQualityPromoter();
    promoter.beginFocusedAnalysis('ide_code_analysis');
    promoter.endFocusedAnalysis();
    expect(promoter.getActiveIntent()).toBeNull();
  });

  it('returns null for a non-text-heavy intent (promotion never activated)', () => {
    const promoter = createVisualQualityPromoter();
    promoter.beginFocusedAnalysis('generic_screenshot');
    expect(promoter.getActiveIntent()).toBeNull();
  });
});

describe('Wave 6 – non-regression: existing wave invariants', () => {
  it('visualQualityPromotion does not touch Wave 4 local encoding constants', async () => {
    const { SCREEN_CAPTURE_JPEG_QUALITY, SCREEN_CAPTURE_MAX_WIDTH_PX } = await import(
      './screenCapturePolicy'
    );
    // Wave 4 constants remain unchanged
    expect(SCREEN_CAPTURE_JPEG_QUALITY).toBe(0.92);
    expect(SCREEN_CAPTURE_MAX_WIDTH_PX).toBe(1920);
  });

  it('VisualSendPolicy state machine starts inactive (Wave 1 invariant)', async () => {
    const { createVisualSendPolicy } = await import('./visualSendPolicy');
    const policy = createVisualSendPolicy();
    expect(policy.getState()).toBe('inactive');
  });

  it('baseline visualSessionQuality default is Low (Wave 5 invariant)', async () => {
    const { DEFAULT_DESKTOP_SETTINGS } = await import('../../../shared/settings');
    expect(DEFAULT_DESKTOP_SETTINGS.visualSessionQuality).toBe('Low');
  });

  it('visualSessionQualityToMediaResolution mapping is unchanged (Wave 5 invariant)', async () => {
    const { visualSessionQualityToMediaResolution } = await import(
      '../transport/visualSessionQuality'
    );
    expect(visualSessionQualityToMediaResolution('Low')).toBe('MEDIA_RESOLUTION_LOW');
    expect(visualSessionQualityToMediaResolution('Medium')).toBe('MEDIA_RESOLUTION_MEDIUM');
    expect(visualSessionQualityToMediaResolution('High')).toBe('MEDIA_RESOLUTION_HIGH');
  });
});

// Type check: VisualAnalysisIntent is exported and usable as a discriminated union
const _typeCheck: VisualAnalysisIntent = 'ide_code_analysis';
void _typeCheck;
