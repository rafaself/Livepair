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

  it('returns the first screen source when multiple eligible sources include a screen source', () => {
    const sources = [windowSource, screenSource];
    expect(selectAutoSource(sources)).toBe(screenSource);
  });

  it('returns the first screen source when multiple screen sources exist', () => {
    const sources = [screenSource, screenSource2];
    expect(selectAutoSource(sources)).toBe(screenSource);
  });

  it('returns null when only window sources remain (no screen source to auto-pick)', () => {
    const sources = [windowSource, { id: 'window:43:0', name: 'Terminal' }];
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
