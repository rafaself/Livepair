// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { selectAutoSource } from './selectAutoSource';
import type { CaptureSource } from './captureSourceRegistry';

const screenSource: CaptureSource = { id: 'screen:1:0', name: 'Entire Screen' };
const screenSource2: CaptureSource = { id: 'screen:2:0', name: 'Built-in Display' };
const windowSource: CaptureSource = { id: 'window:42:0', name: 'VSCode' };
const livepairWindowSource: CaptureSource = { id: 'window:99:0', name: 'Livepair' };

describe('selectAutoSource', () => {
  it('returns the only eligible source when exactly one source exists', () => {
    expect(selectAutoSource([screenSource])).toBe(screenSource);
  });

  it('returns the only non-excluded source when exclusions leave one eligible source', () => {
    const sources = [livepairWindowSource, windowSource];
    const excluded = new Set([livepairWindowSource.id]);
    expect(selectAutoSource(sources, excluded)).toBe(windowSource);
  });

  it('returns null when multiple eligible sources remain', () => {
    const sources = [windowSource, screenSource];
    expect(selectAutoSource(sources)).toBeNull();
  });

  it('returns null when multiple eligible screen sources remain', () => {
    const sources = [screenSource, screenSource2];
    expect(selectAutoSource(sources)).toBeNull();
  });

  it('returns null when all eligible sources are excluded', () => {
    const sources = [livepairWindowSource];
    const excluded = new Set([livepairWindowSource.id]);
    expect(selectAutoSource(sources, excluded)).toBeNull();
  });

  it('returns null for an empty source list', () => {
    expect(selectAutoSource([])).toBeNull();
  });
});
