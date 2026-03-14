// Minimum noise floor clamp — prevents the baseline from collapsing to zero in silence.
export const SPEECH_DETECTOR_MIN_NOISE_FLOOR = 0.0004;

// Slow EMA coefficient for the adaptive noise floor (2 % new, 98 % old).
const NOISE_ALPHA = 0.02;

// Speech / silence hysteresis: separate multipliers relative to the noise floor,
// plus absolute lower bounds so very quiet floors do not produce an overly
// sensitive trigger.
const ENTER_MULTIPLIER = 2.5;
const EXIT_MULTIPLIER = 1.5;
const ENTER_ABS_MIN = 0.006;
const EXIT_ABS_MIN = 0.004;

// AudioWorklet render-quantum size (Web Audio API spec guarantee).
const QUANTUM_SIZE = 128;

export type SpeechActivityDetectorOptions = {
  sampleRate?: number;
  /** How many milliseconds of continuous energy above threshold before entering speech. */
  attackMs?: number;
  /** How many milliseconds of continuous silence below threshold before leaving speech. */
  releaseMs?: number;
  /** Override the starting noise floor (useful in tests to skip warm-up). */
  initialNoiseFloor?: number;
};

/**
 * Lightweight per-frame speech-activity detector with an adaptive noise floor.
 *
 * Call `processSample(rms)` once per render quantum with the RMS energy of that
 * quantum.  Returns `true` whenever the speech-active boolean changes so the
 * caller can emit a change event without streaming raw levels.
 *
 * Algorithm:
 *  1. Compute thresholds from the current (pre-update) noise floor.
 *  2. Advance the hysteresis state machine (attack / release counters).
 *  3. Update the noise floor via a slow EMA — but only while *not* speaking,
 *     so speech energy does not contaminate the ambient baseline.
 */
export class SpeechActivityDetector {
  private _noiseFloor: number;
  private _isSpeaking: boolean;
  private _attackCount: number;
  private _releaseCount: number;

  /** Number of consecutive above-threshold quanta required to enter speech. */
  readonly attackQuanta: number;
  /** Number of consecutive below-threshold quanta required to leave speech. */
  readonly releaseQuanta: number;

  constructor({
    sampleRate = 48_000,
    attackMs = 60,
    releaseMs = 150,
    initialNoiseFloor = SPEECH_DETECTOR_MIN_NOISE_FLOOR,
  }: SpeechActivityDetectorOptions = {}) {
    this._noiseFloor = initialNoiseFloor;
    this._isSpeaking = false;
    this._attackCount = 0;
    this._releaseCount = 0;
    this.attackQuanta = Math.ceil((sampleRate * attackMs) / (1000 * QUANTUM_SIZE));
    this.releaseQuanta = Math.ceil((sampleRate * releaseMs) / (1000 * QUANTUM_SIZE));
  }

  get isSpeaking(): boolean {
    return this._isSpeaking;
  }

  get noiseFloor(): number {
    return this._noiseFloor;
  }

  /**
   * Process one render quantum.
   * @param rms - RMS energy of the quantum (0–1 linear amplitude).
   * @returns `true` if the speech-active state changed this quantum.
   */
  processSample(rms: number): boolean {
    // Step 1: derive adaptive thresholds from the current noise floor.
    const enterThreshold = Math.max(
      this._noiseFloor * ENTER_MULTIPLIER,
      ENTER_ABS_MIN,
    );
    const exitThreshold = Math.max(
      this._noiseFloor * EXIT_MULTIPLIER,
      EXIT_ABS_MIN,
    );

    // Step 2: hysteresis state machine.
    let nextSpeaking = this._isSpeaking;

    if (!this._isSpeaking) {
      if (rms > enterThreshold) {
        this._attackCount++;
        this._releaseCount = 0;
        if (this._attackCount >= this.attackQuanta) {
          nextSpeaking = true;
          this._attackCount = 0;
        }
      } else {
        this._attackCount = 0;
      }
    } else {
      if (rms < exitThreshold) {
        this._releaseCount++;
        this._attackCount = 0;
        if (this._releaseCount >= this.releaseQuanta) {
          nextSpeaking = false;
          this._releaseCount = 0;
        }
      } else {
        this._releaseCount = 0;
      }
    }

    const changed = nextSpeaking !== this._isSpeaking;
    if (changed) {
      this._isSpeaking = nextSpeaking;
    }

    // Step 3: update noise floor after state determination, only while not speaking.
    if (!this._isSpeaking) {
      this._noiseFloor = Math.max(
        SPEECH_DETECTOR_MIN_NOISE_FLOOR,
        this._noiseFloor * (1 - NOISE_ALPHA) + rms * NOISE_ALPHA,
      );
    }

    return changed;
  }
}
