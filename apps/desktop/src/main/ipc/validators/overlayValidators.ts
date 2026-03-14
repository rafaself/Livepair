import type { Rectangle } from 'electron';

export function toOverlayRectangles(input: unknown): Rectangle[] {
  if (!Array.isArray(input)) {
    throw new Error('overlay:setHitRegions requires an array of rectangles');
  }

  return input.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('overlay:setHitRegions requires an array of rectangles');
    }

    const { x, y, width, height } = entry as Record<string, unknown>;
    if (
      typeof x !== 'number'
      || typeof y !== 'number'
      || typeof width !== 'number'
      || typeof height !== 'number'
      || !Number.isFinite(x)
      || !Number.isFinite(y)
      || !Number.isFinite(width)
      || !Number.isFinite(height)
    ) {
      throw new Error('overlay:setHitRegions requires an array of rectangles');
    }

    const normalized = {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
    };

    if (normalized.width <= 0 || normalized.height <= 0) {
      throw new Error('overlay:setHitRegions requires positive width and height');
    }

    return normalized;
  });
}
