import { describe, expect, it } from 'vitest';
import {
  PCM16_BYTES_PER_SAMPLE,
  PCM16_CHUNK_BYTE_SIZE,
  PCM16_CHUNK_DURATION_MS,
  TARGET_VOICE_SAMPLE_RATE,
  Pcm16Chunker,
  StreamingPcm16ChunkEncoder,
  StreamingFloat32Resampler,
  encodePcm16Le,
  mixToMono,
} from './audioProcessing';

describe('mixToMono', () => {
  it('returns a cloned mono buffer when only one channel is provided', () => {
    const input = new Float32Array([0.25, -0.25, 0.75]);

    const mixed = mixToMono([input]);

    expect(Array.from(mixed)).toEqual([0.25, -0.25, 0.75]);
    expect(mixed).not.toBe(input);
  });

  it('averages stereo channels into mono', () => {
    const left = new Float32Array([0.8, -0.6, 0.4]);
    const right = new Float32Array([0.2, -0.2, -0.4]);

    const mixed = mixToMono([left, right]);

    expect(mixed[0]).toBeCloseTo(0.5, 5);
    expect(mixed[1]).toBeCloseTo(-0.4, 5);
    expect(mixed[2]).toBeCloseTo(0, 5);
  });
});

describe('StreamingFloat32Resampler', () => {
  it('normalizes 48 kHz input to 16 kHz output across streaming pushes', () => {
    const resampler = new StreamingFloat32Resampler(48_000, TARGET_VOICE_SAMPLE_RATE);
    const first = resampler.push(
      Float32Array.from({ length: 240 }, (_value, index) => index / 240),
    );
    const second = resampler.push(
      Float32Array.from({ length: 240 }, (_value, index) => (240 + index) / 480),
    );

    expect(first.length).toBe(80);
    expect(second.length).toBe(80);
    expect(first[0]).toBeCloseTo(0, 5);
    expect(first[1]).toBeCloseTo(3 / 240, 5);
    expect(second.at(-1) ?? 0).toBeCloseTo(477 / 480, 5);
  });
});

describe('encodePcm16Le', () => {
  it('encodes Float32 samples into signed 16-bit little-endian PCM bytes', () => {
    const bytes = encodePcm16Le(new Float32Array([-1, -0.5, 0, 0.5, 1]));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    expect(bytes.byteLength).toBe(5 * PCM16_BYTES_PER_SAMPLE);
    expect(view.getInt16(0, true)).toBe(-32768);
    expect(view.getInt16(2, true)).toBe(-16384);
    expect(view.getInt16(4, true)).toBe(0);
    expect(view.getInt16(6, true)).toBe(16384);
    expect(view.getInt16(8, true)).toBe(32767);
  });
});

describe('Pcm16Chunker', () => {
  it('emits fixed 20 ms chunks and preserves carry-over bytes between pushes', () => {
    const chunker = new Pcm16Chunker(PCM16_CHUNK_BYTE_SIZE);
    const firstPush = new Uint8Array(400).fill(1);
    const secondPush = new Uint8Array(600).fill(2);

    expect(chunker.push(firstPush)).toEqual([]);

    const chunks = chunker.push(secondPush);
    const firstChunk = chunks[0];

    expect(chunks).toHaveLength(1);
    expect(firstChunk).toBeDefined();
    expect(firstChunk).toHaveLength(PCM16_CHUNK_BYTE_SIZE);
    expect(Array.from(firstChunk!.slice(0, 400))).toEqual(new Array(400).fill(1));
    expect(Array.from(firstChunk!.slice(400))).toEqual(new Array(240).fill(2));
    expect(chunker.getPendingByteLength()).toBe(360);
    expect(PCM16_CHUNK_DURATION_MS).toBe(20);
  });
});

describe('StreamingPcm16ChunkEncoder', () => {
  it('mixes, resamples, encodes, and chunks streaming audio across pushes', () => {
    const encoder = new StreamingPcm16ChunkEncoder(48_000);

    const first = encoder.push([
      Float32Array.from({ length: 480 }, () => 0.25),
    ]);
    const second = encoder.push([
      Float32Array.from({ length: 480 }, () => 0.25),
    ]);

    expect(first).toEqual([]);
    expect(second).toHaveLength(1);
    expect(second[0]).toHaveLength(PCM16_CHUNK_BYTE_SIZE);

    const view = new DataView(
      second[0]!.buffer,
      second[0]!.byteOffset,
      second[0]!.byteLength,
    );

    expect(view.getInt16(0, true)).toBe(8192);
    expect(view.getInt16(2, true)).toBe(8192);
  });
});
