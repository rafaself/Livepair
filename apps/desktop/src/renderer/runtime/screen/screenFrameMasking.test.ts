import { describe, expect, it } from 'vitest';
import type {
  OverlayHitRegion,
  ScreenCaptureOverlayDisplay,
  ScreenCaptureSource,
} from '../../../shared';
import { getCaptureExclusionMaskRects } from './screenFrameMasking';

const OVERLAY_DISPLAY: ScreenCaptureOverlayDisplay = {
  displayId: 'display-1',
  bounds: { x: 10, y: 20, width: 2000, height: 1000 },
  workArea: { x: 50, y: 70, width: 1900, height: 900 },
  scaleFactor: 2,
};

function createScreenSource(
  overrides: Partial<ScreenCaptureSource> = {},
): ScreenCaptureSource {
  return {
    id: 'screen-1',
    name: 'Entire screen',
    kind: 'screen',
    displayId: 'display-1',
    ...overrides,
  };
}

function createWindowSource(
  overrides: Partial<ScreenCaptureSource> = {},
): ScreenCaptureSource {
  return {
    id: 'window-1',
    name: 'Livepair',
    kind: 'window',
    ...overrides,
  };
}

describe('getCaptureExclusionMaskRects', () => {
  it('maps work-area-relative overlay rects into canvas coordinates for a matching screen source', () => {
    const exclusionRects: OverlayHitRegion[] = [
      { x: 100, y: 50, width: 300, height: 200 },
      { x: 800, y: 200, width: 100, height: 100 },
    ];

    expect(getCaptureExclusionMaskRects({
      canvasWidth: 1000,
      canvasHeight: 500,
      exclusionRects,
      overlayDisplay: OVERLAY_DISPLAY,
      selectedSource: createScreenSource(),
    })).toEqual([
      { x: 70, y: 50, width: 150, height: 100 },
      { x: 420, y: 125, width: 50, height: 50 },
    ]);
  });

  it('clamps converted mask rects to the canvas bounds', () => {
    expect(getCaptureExclusionMaskRects({
      canvasWidth: 400,
      canvasHeight: 200,
      exclusionRects: [{ x: -30, y: -20, width: 60, height: 40 }],
      overlayDisplay: {
        displayId: 'display-1',
        bounds: { x: 0, y: 0, width: 200, height: 100 },
        workArea: { x: 20, y: 10, width: 160, height: 80 },
        scaleFactor: 1,
      },
      selectedSource: createScreenSource(),
    })).toEqual([
      { x: 0, y: 0, width: 100, height: 60 },
    ]);
  });

  it('returns no mask rects for window capture', () => {
    expect(getCaptureExclusionMaskRects({
      canvasWidth: 1000,
      canvasHeight: 500,
      exclusionRects: [{ x: 100, y: 50, width: 300, height: 200 }],
      overlayDisplay: OVERLAY_DISPLAY,
      selectedSource: createWindowSource(),
    })).toEqual([]);
  });

  it('returns no mask rects for a screen on another display', () => {
    expect(getCaptureExclusionMaskRects({
      canvasWidth: 1000,
      canvasHeight: 500,
      exclusionRects: [{ x: 100, y: 50, width: 300, height: 200 }],
      overlayDisplay: OVERLAY_DISPLAY,
      selectedSource: createScreenSource({ displayId: 'display-2' }),
    })).toEqual([]);
  });

  it('returns no mask rects when overlay display metadata is missing or no rects are visible', () => {
    expect(getCaptureExclusionMaskRects({
      canvasWidth: 1000,
      canvasHeight: 500,
      exclusionRects: [],
      overlayDisplay: OVERLAY_DISPLAY,
      selectedSource: createScreenSource(),
    })).toEqual([]);

    expect(getCaptureExclusionMaskRects({
      canvasWidth: 1000,
      canvasHeight: 500,
      exclusionRects: [{ x: 100, y: 50, width: 300, height: 200 }],
      overlayDisplay: null,
      selectedSource: createScreenSource(),
    })).toEqual([]);
  });
});
