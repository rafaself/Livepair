import type { OverlayHitRegion } from '../../preload/preload';

function toIntegerRect(element: Element): OverlayHitRegion | null {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function mergeRows(rows: OverlayHitRegion[]): OverlayHitRegion[] {
  const merged: OverlayHitRegion[] = [];

  for (const row of rows) {
    const previous = merged.at(-1);
    if (
      previous &&
      previous.x === row.x &&
      previous.width === row.width &&
      previous.y + previous.height === row.y
    ) {
      previous.height += row.height;
      continue;
    }

    merged.push({ ...row });
  }

  return merged;
}

function toCapsuleRegions(rect: OverlayHitRegion): OverlayHitRegion[] {
  const radius = Math.min(Math.floor(rect.width / 2), Math.floor(rect.height / 2));
  if (radius <= 1) {
    return [rect];
  }

  const rows: OverlayHitRegion[] = [];

  for (let yOffset = 0; yOffset < rect.height; yOffset += 1) {
    const mirroredOffset = Math.min(yOffset, rect.height - yOffset - 1);
    let inset = 0;

    if (mirroredOffset < radius) {
      const dy = radius - (mirroredOffset + 0.5);
      inset = Math.ceil(radius - Math.sqrt(Math.max(0, radius * radius - dy * dy)));
    }

    const width = rect.width - inset * 2;
    if (width <= 0) {
      continue;
    }

    rows.push({
      x: rect.x + inset,
      y: rect.y + yOffset,
      width,
      height: 1,
    });
  }

  return mergeRows(rows);
}

export function toOverlayHitRegions(element: Element): OverlayHitRegion[] {
  const rect = toIntegerRect(element);
  if (!rect) {
    return [];
  }

  // The dock is rendered as a pill; Linux window shaping needs a capsule region
  // to avoid exposing a rectangular overlay around the rounded surface.
  if (element.matches('.control-dock')) {
    return toCapsuleRegions(rect);
  }

  return [rect];
}
