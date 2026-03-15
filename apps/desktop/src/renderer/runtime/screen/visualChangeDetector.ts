/**
 * Simple frame fingerprinting for visual change detection.
 *
 * Samples a fixed number of bytes from the captured JPEG frame data at
 * evenly-spaced positions to create a lightweight fingerprint.  When the
 * difference between consecutive fingerprints exceeds a threshold, a
 * "visual change" is reported.
 *
 * This is intentionally a rough heuristic – the goal is to catch
 * significant screen changes (window switch, scroll, new content) while
 * ignoring minor JPEG compression noise.
 */

/** Number of evenly-spaced bytes sampled from each frame. */
export const VISUAL_CHANGE_SAMPLE_SIZE = 64;

/** Fraction of samples that must differ (0–1) to report a change. */
export const VISUAL_CHANGE_THRESHOLD = 0.3;

/** Per-byte absolute difference tolerance to absorb JPEG noise. */
export const VISUAL_CHANGE_BYTE_TOLERANCE = 10;

export type VisualChangeDetector = {
  /**
   * Feed a captured frame.  Returns true when a significant visual change
   * is detected relative to the current baseline.  The baseline is updated
   * to the new frame on every change.
   *
   * Returns false on the very first call (no baseline to compare against).
   */
  onFrame(frame: { data: Uint8Array }): boolean;

  /** Reset the baseline (e.g. on screen share stop). */
  reset(): void;
};

export type VisualChangeDetectorOptions = {
  sampleSize?: number;
  threshold?: number;
  byteTolerance?: number;
};

export function createVisualChangeDetector(
  options?: VisualChangeDetectorOptions,
): VisualChangeDetector {
  const sampleSize = options?.sampleSize ?? VISUAL_CHANGE_SAMPLE_SIZE;
  const threshold = options?.threshold ?? VISUAL_CHANGE_THRESHOLD;
  const byteTolerance = options?.byteTolerance ?? VISUAL_CHANGE_BYTE_TOLERANCE;

  let baseline: Uint8Array | null = null;

  function sampleFingerprint(data: Uint8Array): Uint8Array {
    const sample = new Uint8Array(sampleSize);
    if (data.length === 0) return sample;

    const step = Math.max(1, Math.floor(data.length / sampleSize));
    for (let i = 0; i < sampleSize; i++) {
      sample[i] = data[Math.min(i * step, data.length - 1)];
    }
    return sample;
  }

  function computeDiffRatio(a: Uint8Array, b: Uint8Array): number {
    let diffCount = 0;
    for (let i = 0; i < a.length; i++) {
      if (Math.abs(a[i] - b[i]) > byteTolerance) {
        diffCount++;
      }
    }
    return diffCount / a.length;
  }

  return {
    onFrame(frame) {
      const fingerprint = sampleFingerprint(frame.data);

      if (!baseline) {
        baseline = fingerprint;
        return false;
      }

      const diff = computeDiffRatio(baseline, fingerprint);
      const changed = diff >= threshold;

      if (changed) {
        baseline = fingerprint;
      }

      return changed;
    },

    reset() {
      baseline = null;
    },
  };
}
