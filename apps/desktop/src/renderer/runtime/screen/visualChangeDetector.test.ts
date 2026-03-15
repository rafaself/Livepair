import { describe, expect, it } from 'vitest';
import {
  createVisualChangeDetector,
  VISUAL_CHANGE_SAMPLE_SIZE,
  VISUAL_CHANGE_THRESHOLD,
  VISUAL_CHANGE_BYTE_TOLERANCE,
} from './visualChangeDetector';

describe('createVisualChangeDetector', () => {
  it('returns false on the very first frame (no baseline)', () => {
    const detector = createVisualChangeDetector();
    const frame = { data: new Uint8Array(1024).fill(128) };
    expect(detector.onFrame(frame)).toBe(false);
  });

  it('returns false when consecutive frames are identical', () => {
    const detector = createVisualChangeDetector();
    const frame = { data: new Uint8Array(1024).fill(100) };
    detector.onFrame(frame); // baseline
    expect(detector.onFrame(frame)).toBe(false);
    expect(detector.onFrame(frame)).toBe(false);
  });

  it('returns false when frames differ within byte tolerance', () => {
    const detector = createVisualChangeDetector();
    const frame1 = { data: new Uint8Array(1024).fill(100) };
    const frame2 = { data: new Uint8Array(1024).fill(100 + VISUAL_CHANGE_BYTE_TOLERANCE) };
    detector.onFrame(frame1);
    expect(detector.onFrame(frame2)).toBe(false);
  });

  it('returns true when frames differ beyond byte tolerance for enough samples', () => {
    const detector = createVisualChangeDetector();
    const frame1 = { data: new Uint8Array(1024).fill(50) };
    const frame2 = { data: new Uint8Array(1024).fill(200) };
    detector.onFrame(frame1);
    expect(detector.onFrame(frame2)).toBe(true);
  });

  it('updates baseline on change so the next identical frame is not a change', () => {
    const detector = createVisualChangeDetector();
    const frame1 = { data: new Uint8Array(1024).fill(50) };
    const frame2 = { data: new Uint8Array(1024).fill(200) };
    detector.onFrame(frame1);
    expect(detector.onFrame(frame2)).toBe(true);
    // Now baseline is frame2; same frame should not be a change
    expect(detector.onFrame(frame2)).toBe(false);
  });

  it('reset clears baseline so the next frame returns false', () => {
    const detector = createVisualChangeDetector();
    const frame1 = { data: new Uint8Array(1024).fill(50) };
    const frame2 = { data: new Uint8Array(1024).fill(200) };
    detector.onFrame(frame1);
    detector.reset();
    // After reset, next frame is treated as first frame
    expect(detector.onFrame(frame2)).toBe(false);
  });

  it('handles empty frame data gracefully', () => {
    const detector = createVisualChangeDetector();
    const frame = { data: new Uint8Array(0) };
    expect(detector.onFrame(frame)).toBe(false);
    expect(detector.onFrame(frame)).toBe(false);
  });

  it('handles frames smaller than sample size', () => {
    const detector = createVisualChangeDetector();
    const frame1 = { data: new Uint8Array(4).fill(10) };
    const frame2 = { data: new Uint8Array(4).fill(200) };
    detector.onFrame(frame1);
    expect(detector.onFrame(frame2)).toBe(true);
  });

  it('respects custom threshold', () => {
    // With threshold = 1.0, ALL samples must differ
    const detector = createVisualChangeDetector({ threshold: 1.0 });
    const frame1 = { data: new Uint8Array(1024).fill(50) };
    // Only change half the data
    const frame2 = { data: new Uint8Array(1024) };
    frame2.data.fill(50, 0, 512);
    frame2.data.fill(200, 512);
    detector.onFrame(frame1);
    // Less than 100% of samples differ → no change
    expect(detector.onFrame(frame2)).toBe(false);
  });

  it('detects partial screen changes when enough samples differ', () => {
    const detector = createVisualChangeDetector();
    const frame1 = { data: new Uint8Array(1024).fill(100) };
    // Change more than threshold fraction of the data
    const frame2 = { data: new Uint8Array(1024).fill(100) };
    const changeCount = Math.ceil(1024 * (VISUAL_CHANGE_THRESHOLD + 0.1));
    for (let i = 0; i < changeCount; i++) {
      frame2.data[i] = 250;
    }
    detector.onFrame(frame1);
    expect(detector.onFrame(frame2)).toBe(true);
  });

  it('exports expected default constants', () => {
    expect(VISUAL_CHANGE_SAMPLE_SIZE).toBe(64);
    expect(VISUAL_CHANGE_THRESHOLD).toBe(0.3);
    expect(VISUAL_CHANGE_BYTE_TOLERANCE).toBe(10);
  });
});
