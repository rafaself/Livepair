import { describe, expect, it } from 'vitest';
import { createScreenBurstDetector } from './screenBurstDetector';
import { buildScreenFrameAnalysis } from './screenFrameAnalysis';

function createFrame(
  widthPx: number,
  heightPx: number,
  grayscaleAt: (x: number, y: number) => number,
) {
  const data = new Uint8ClampedArray(widthPx * heightPx * 4);

  for (let y = 0; y < heightPx; y += 1) {
    for (let x = 0; x < widthPx; x += 1) {
      const value = grayscaleAt(x, y);
      const index = ((y * widthPx) + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }

  return buildScreenFrameAnalysis({ data, width: widthPx, height: heightPx });
}

describe('createScreenBurstDetector', () => {
  it('keeps static frames below the adaptive burst threshold', () => {
    const detector = createScreenBurstDetector();
    const staticFrame = createFrame(160, 90, () => 48);

    detector.observe(staticFrame, 0);
    detector.observe(staticFrame, 1_000);
    detector.observe(staticFrame, 2_000);
    const result = detector.observe(staticFrame, 3_000);

    expect(result.triggered).toBe(false);
    expect(result.score).toBe(0);
  });

  it('triggers on a subtle local UI change using the composite thumbnail score', () => {
    const detector = createScreenBurstDetector();
    const baseline = createFrame(160, 90, () => 42);
    const changed = createFrame(160, 90, (x, y) => {
      if (x >= 84 && x < 128 && y >= 26 && y < 62) {
        return x < 106 ? 228 : 24;
      }

      return 42;
    });

    detector.observe(baseline, 0);
    detector.observe(baseline, 1_000);
    detector.observe(baseline, 2_000);
    const result = detector.observe(changed, 3_000);

    expect(result.triggered).toBe(true);
    expect(result.luminanceDelta).toBeGreaterThan(0);
    expect(result.edgeDelta).toBeGreaterThan(0);
    expect(result.hashDistance).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(0);
  });
});
