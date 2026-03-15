// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { selectAutoSource } from './selectAutoSource';
import type { CaptureSource } from './captureSourceRegistry';

const screenSource: CaptureSource = { id: 'screen:1:0', name: 'Entire Screen' };
const screenSource2: CaptureSource = { id: 'screen:2:0', name: 'Built-in Display' };
const windowSource: CaptureSource = { id: 'window:42:0', name: 'VSCode' };
const livepairWindowSource: CaptureSource = { id: 'window:99:0', name: 'Livepair' };

describe('selectAutoSource', () => {
  it('prefers a screen source even when a window source appears first in the list', () => {
    const sources = [windowSource, screenSource];
    expect(selectAutoSource(sources)).toBe(screenSource);
  });

  it('returns the first screen source when multiple screen sources exist', () => {
    const sources = [windowSource, screenSource, screenSource2];
    expect(selectAutoSource(sources)).toBe(screenSource);
  });

  it('excludes sources whose ids are in the excluded set from automatic selection', () => {
    const sources = [livepairWindowSource, windowSource, screenSource];
    const excluded = new Set([livepairWindowSource.id]);
    expect(selectAutoSource(sources, excluded)).toBe(screenSource);
  });

  it('excludes the app own overlay window when it is the only window source and a screen source exists', () => {
    const sources = [livepairWindowSource, screenSource];
    const excluded = new Set([livepairWindowSource.id]);
    expect(selectAutoSource(sources, excluded)).toBe(screenSource);
  });

  it('falls back deterministically to the first non-excluded window source when no screen source exists', () => {
    const sources = [livepairWindowSource, windowSource];
    const excluded = new Set([livepairWindowSource.id]);
    expect(selectAutoSource(sources, excluded)).toBe(windowSource);
  });

  it('returns null when all sources are excluded and none remain', () => {
    const sources = [livepairWindowSource];
    const excluded = new Set([livepairWindowSource.id]);
    expect(selectAutoSource(sources, excluded)).toBeNull();
  });

  it('returns null for an empty source list', () => {
    expect(selectAutoSource([])).toBeNull();
  });

  it('returns the first screen source with no excluded set provided', () => {
    expect(selectAutoSource([windowSource, screenSource])).toBe(screenSource);
  });

  it('returns the first window source when no screen sources and no exclusions', () => {
    expect(selectAutoSource([windowSource])).toBe(windowSource);
  });

  it('does not exclude window sources from manual selection — selectAutoSource only filters when called', () => {
    // Manual selection bypasses selectAutoSource entirely; this test documents
    // that the function only operates on what it is given.
    const sources = [livepairWindowSource];
    // Without an excluded set, selectAutoSource returns it (manual path passes no exclusions)
    expect(selectAutoSource(sources)).toBe(livepairWindowSource);
  });
});
