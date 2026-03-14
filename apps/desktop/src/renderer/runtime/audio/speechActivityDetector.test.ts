import { describe, expect, it } from 'vitest';
import {
  SPEECH_DETECTOR_MIN_NOISE_FLOOR,
  SpeechActivityDetector,
} from './speechActivityDetector';

// All tests use 48 kHz so attackQuanta = ceil(48000 * 0.06 / 128) = 23
//                                  releaseQuanta = ceil(48000 * 0.15 / 128) = 57

function makeDetector(overrides: {
  initialNoiseFloor?: number;
  attackMs?: number;
  releaseMs?: number;
} = {}): SpeechActivityDetector {
  return new SpeechActivityDetector({
    sampleRate: 48_000,
    attackMs: 60,
    releaseMs: 150,
    ...overrides,
  });
}

/** Feed N identical RMS samples; return array of changed booleans. */
function feed(detector: SpeechActivityDetector, rms: number, frames: number): boolean[] {
  return Array.from({ length: frames }, () => detector.processSample(rms));
}

describe('SpeechActivityDetector', () => {
  it('requires sustained energy above adaptive threshold to enter speech', () => {
    // initialNoiseFloor=0.001 → enterThreshold starts at max(0.0025, 0.006)=0.006
    // rms=0.05 stays above threshold for all 23 attack quanta
    const detector = makeDetector({ initialNoiseFloor: 0.001 });

    // attackQuanta − 1 frames: no transition yet
    const preAttack = feed(detector, 0.05, detector.attackQuanta - 1);
    expect(preAttack.every((c) => c === false)).toBe(true);
    expect(detector.isSpeaking).toBe(false);

    // The final attack quantum triggers speech
    const changed = detector.processSample(0.05);
    expect(changed).toBe(true);
    expect(detector.isSpeaking).toBe(true);
  });

  it('does not enter speech when RMS stays near the noise floor', () => {
    // initialNoiseFloor=0.001 → enterThreshold=0.006; rms=0.004 never clears it.
    // Even after the floor converges to 0.004 the threshold stays at max(0.01,0.006)=0.01,
    // still above rms=0.004.
    const detector = makeDetector({ initialNoiseFloor: 0.001 });
    const results = feed(detector, 0.004, detector.attackQuanta * 4);
    expect(results.every((c) => c === false)).toBe(true);
    expect(detector.isSpeaking).toBe(false);
  });

  it('exits speech after RMS is sustained below the exit threshold', () => {
    // Use same config as entry test; once speaking, exit threshold ≈ 0.028
    const detector = makeDetector({ initialNoiseFloor: 0.001 });
    feed(detector, 0.05, detector.attackQuanta);
    expect(detector.isSpeaking).toBe(true);

    // releaseQuanta − 1 frames: still speaking
    const preRelease = feed(detector, 0.001, detector.releaseQuanta - 1);
    expect(preRelease.every((c) => c === false)).toBe(true);
    expect(detector.isSpeaking).toBe(true);

    // The final release quantum ends speech
    const changed = detector.processSample(0.001);
    expect(changed).toBe(true);
    expect(detector.isSpeaking).toBe(false);
  });

  it('detects quieter speech when the ambient noise floor is low', () => {
    // rms=0.01 is below the old fixed start threshold (0.015) but above the adaptive
    // threshold (0.006 abs-min) when the floor is at its minimum.
    // initialNoiseFloor=SPEECH_DETECTOR_MIN_NOISE_FLOOR=0.0004 represents a very quiet room.
    const detector = makeDetector({ initialNoiseFloor: SPEECH_DETECTOR_MIN_NOISE_FLOOR });
    feed(detector, 0.01, detector.attackQuanta);
    expect(detector.isSpeaking).toBe(true);
  });

  it('noise floor adapts toward ambient RMS while not speaking', () => {
    // Feed rms=0.003 (below abs-min enter threshold) for a long time.
    // The floor should converge close to 0.003 from its starting value of MIN_NOISE_FLOOR.
    const detector = makeDetector({ initialNoiseFloor: SPEECH_DETECTOR_MIN_NOISE_FLOOR });
    feed(detector, 0.003, 300);
    // After 300 frames: floor ≈ 0.003 * (1 − 0.98^300) ≈ 0.00299
    expect(detector.noiseFloor).toBeGreaterThan(0.002);
    expect(detector.isSpeaking).toBe(false);
  });

  it('noise floor is frozen while in speech', () => {
    const detector = makeDetector({ initialNoiseFloor: 0.001 });
    feed(detector, 0.05, detector.attackQuanta);
    expect(detector.isSpeaking).toBe(true);

    const floorAtOnset = detector.noiseFloor;

    // 100 more frames of loud audio while speaking — floor must not change
    feed(detector, 0.05, 100);
    expect(detector.noiseFloor).toBe(floorAtOnset);
  });

  it('a single drop below exit threshold does not end speech if RMS recovers', () => {
    // This exercises the _releaseCount = 0 reset branch.
    const detector = makeDetector({ initialNoiseFloor: 0.001 });
    feed(detector, 0.05, detector.attackQuanta);
    expect(detector.isSpeaking).toBe(true);

    // One quiet frame — release counter starts
    detector.processSample(0.001);
    // Loud frame — release counter resets
    const changed = detector.processSample(0.05);
    expect(changed).toBe(false);
    expect(detector.isSpeaking).toBe(true);
  });

  it('attack counter resets after a gap below threshold', () => {
    // Use attackMs=20 (attackQuanta=8) so the floor cannot inflate past rms=0.05
    // within the 8-quantum window — a property that holds across both batches.
    const detector = new SpeechActivityDetector({
      sampleRate: 48_000,
      attackMs: 20,
      releaseMs: 150,
      initialNoiseFloor: 0.001,
    });

    // attackQuanta−1 frames above threshold: counter builds but speech does not start
    feed(detector, 0.05, detector.attackQuanta - 1);
    expect(detector.isSpeaking).toBe(false);

    // One frame below threshold: attack counter resets
    detector.processSample(0.001);
    expect(detector.isSpeaking).toBe(false);

    // attackQuanta−1 frames again: still not speaking (counter was reset)
    feed(detector, 0.05, detector.attackQuanta - 1);
    expect(detector.isSpeaking).toBe(false);

    // The attackQuanta-th consecutive above-threshold frame triggers speech
    const changed = detector.processSample(0.05);
    expect(changed).toBe(true);
    expect(detector.isSpeaking).toBe(true);
  });
});
