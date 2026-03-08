import { describe, expect, it } from 'vitest';
import { toOverlayHitRegions } from './overlayHitRegions';

function createElementWithRect(
  className: string,
  rect: { x: number; y: number; width: number; height: number },
): HTMLElement {
  const element = document.createElement('div');
  element.className = className;
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      top: rect.y,
      left: rect.x,
      right: rect.x + rect.width,
      bottom: rect.y + rect.height,
      toJSON: () => ({}),
    }),
  });
  return element;
}

describe('toOverlayHitRegions', () => {
  it('keeps non-pill surfaces rectangular', () => {
    const panel = createElementWithRect('panel panel--open', {
      x: 1580,
      y: 0,
      width: 340,
      height: 1080,
    });

    expect(toOverlayHitRegions(panel)).toEqual([
      { x: 1580, y: 0, width: 340, height: 1080 },
    ]);
  });

  it('approximates the control dock as a capsule instead of a bounding box', () => {
    const dock = createElementWithRect('control-dock', {
      x: 1500,
      y: 300,
      width: 80,
      height: 220,
    });

    const regions = toOverlayHitRegions(dock);

    expect(regions.length).toBeGreaterThan(3);
    const firstRegion = regions[0];
    expect(firstRegion).toBeDefined();
    expect(firstRegion!.y).toBe(300);
    expect(firstRegion!.x).toBeGreaterThan(1500);
    expect(firstRegion!.width).toBeLessThan(80);
    expect(regions.some((region) => region.x === 1500 && region.width === 80)).toBe(true);
    expect(regions.at(-1)?.x).toBe(firstRegion!.x);
    expect(regions.at(-1)?.width).toBe(firstRegion!.width);
  });
});
