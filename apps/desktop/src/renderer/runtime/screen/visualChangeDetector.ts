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
export const VISUAL_CHANGE_SAMPLE_SIZE = 96;

/** Fraction of samples that must differ (0–1) to report a change. */
export const VISUAL_CHANGE_THRESHOLD = 0.35;

/** Per-byte absolute difference tolerance to absorb JPEG noise. */
export const VISUAL_CHANGE_BYTE_TOLERANCE = 15;

// ── Shared fingerprinting helpers ─────────────────────────────────────────

function sampleFingerprint(
  data: Uint8Array,
  sampleSize: number,
): Uint8Array {
  const sample = new Uint8Array(sampleSize);
  if (data.length === 0) return sample;

  const step = Math.max(1, Math.floor(data.length / sampleSize));
  for (let i = 0; i < sampleSize; i++) {
    sample[i] = data[Math.min(i * step, data.length - 1)] ?? 0;
  }
  return sample;
}

function computeDiffRatio(
  a: Uint8Array,
  b: Uint8Array,
  byteTolerance: number,
): number {
  if (a.length === 0) return 0;
  let diffCount = 0;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs((a[i] ?? 0) - (b[i] ?? 0)) > byteTolerance) {
      diffCount++;
    }
  }
  return diffCount / a.length;
}

// ── Visual change detector ────────────────────────────────────────────────

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

  return {
    onFrame(frame) {
      const fingerprint = sampleFingerprint(frame.data, sampleSize);

      if (!baseline) {
        baseline = fingerprint;
        return false;
      }

      const diff = computeDiffRatio(baseline, fingerprint, byteTolerance);
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

// ── Burst send gate ───────────────────────────────────────────────────────
//
// Compares a candidate frame against the *last sent* frame to suppress
// near-duplicate sends during burst mode.  Uses the same fingerprinting
// approach as the change detector but with a lower threshold (we want to
// send even modestly different frames, just not identical ones).

/** Diff threshold for the burst send gate — lower than change detector. */
export const BURST_SEND_GATE_THRESHOLD = 0.15;

/** Byte tolerance for the burst send gate — matches JPEG noise floor. */
export const BURST_SEND_GATE_BYTE_TOLERANCE = 15;

export type BurstSendGate = {
  /** Returns true if the frame is different enough from the last sent to warrant sending. */
  shouldSend(frame: { data: Uint8Array }): boolean;
  /** Record the fingerprint of a frame that was actually sent. */
  onFrameSent(frame: { data: Uint8Array }): void;
  /** Clear the last-sent baseline (e.g. on burst end or screen share stop). */
  reset(): void;
};

export type BurstSendGateOptions = {
  sampleSize?: number;
  threshold?: number;
  byteTolerance?: number;
};

export function createBurstSendGate(
  options?: BurstSendGateOptions,
): BurstSendGate {
  const sgSampleSize = options?.sampleSize ?? VISUAL_CHANGE_SAMPLE_SIZE;
  const sgThreshold = options?.threshold ?? BURST_SEND_GATE_THRESHOLD;
  const sgByteTolerance = options?.byteTolerance ?? BURST_SEND_GATE_BYTE_TOLERANCE;

  let lastSentFingerprint: Uint8Array | null = null;

  return {
    shouldSend(frame) {
      if (!lastSentFingerprint) return true;
      const fingerprint = sampleFingerprint(frame.data, sgSampleSize);
      const diff = computeDiffRatio(lastSentFingerprint, fingerprint, sgByteTolerance);
      return diff >= sgThreshold;
    },

    onFrameSent(frame) {
      lastSentFingerprint = sampleFingerprint(frame.data, sgSampleSize);
    },

    reset() {
      lastSentFingerprint = null;
    },
  };
}
