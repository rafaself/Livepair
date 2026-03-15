import { describe, expect, it } from 'vitest';
import {
  createVisualChangeDetector,
  createBurstSendGate,
  VISUAL_CHANGE_SAMPLE_SIZE,
  VISUAL_CHANGE_THRESHOLD,
  VISUAL_CHANGE_BYTE_TOLERANCE,
  BURST_SEND_GATE_THRESHOLD,
  BURST_SEND_GATE_BYTE_TOLERANCE,
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
    expect(VISUAL_CHANGE_SAMPLE_SIZE).toBe(96);
    expect(VISUAL_CHANGE_THRESHOLD).toBe(0.35);
    expect(VISUAL_CHANGE_BYTE_TOLERANCE).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// Burst send gate
// ---------------------------------------------------------------------------
describe('createBurstSendGate', () => {
  it('returns true on first call (no baseline)', () => {
    const gate = createBurstSendGate();
    const frame = { data: new Uint8Array(1024).fill(100) };
    expect(gate.shouldSend(frame)).toBe(true);
  });

  it('returns false for identical frame after onFrameSent', () => {
    const gate = createBurstSendGate();
    const frame = { data: new Uint8Array(1024).fill(100) };
    gate.onFrameSent(frame);
    expect(gate.shouldSend(frame)).toBe(false);
  });

  it('returns true when frame differs sufficiently from last sent', () => {
    const gate = createBurstSendGate();
    const sent = { data: new Uint8Array(1024).fill(50) };
    const next = { data: new Uint8Array(1024).fill(200) };
    gate.onFrameSent(sent);
    expect(gate.shouldSend(next)).toBe(true);
  });

  it('shouldSend does not update the baseline (requires explicit onFrameSent)', () => {
    const gate = createBurstSendGate();
    const sent = { data: new Uint8Array(1024).fill(50) };
    const next = { data: new Uint8Array(1024).fill(200) };
    gate.onFrameSent(sent);

    // shouldSend returns true but does not update baseline
    expect(gate.shouldSend(next)).toBe(true);
    // Calling shouldSend again with the same frame still compares vs original sent
    expect(gate.shouldSend(next)).toBe(true);
  });

  it('reset clears baseline so next call returns true', () => {
    const gate = createBurstSendGate();
    const frame = { data: new Uint8Array(1024).fill(100) };
    gate.onFrameSent(frame);
    expect(gate.shouldSend(frame)).toBe(false);

    gate.reset();
    expect(gate.shouldSend(frame)).toBe(true);
  });

  it('respects custom threshold', () => {
    // With threshold = 1.0, only completely different frames pass
    const gate = createBurstSendGate({ threshold: 1.0 });
    const sent = { data: new Uint8Array(1024).fill(100) };
    // Change only half the data
    const next = { data: new Uint8Array(1024) };
    next.data.fill(100, 0, 512);
    next.data.fill(200, 512);
    gate.onFrameSent(sent);
    expect(gate.shouldSend(next)).toBe(false);
  });

  it('exports expected default constants', () => {
    expect(BURST_SEND_GATE_THRESHOLD).toBe(0.15);
    expect(BURST_SEND_GATE_BYTE_TOLERANCE).toBe(15);
  });
});
