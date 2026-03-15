import type { OverlayHitRegion } from '../../shared/desktopBridge';
import type { CaptureExclusionOverlayVisibility } from '../runtime/public';

export type VisibleOverlayRect = OverlayHitRegion;
export type VisibleOverlaySnapshot = {
  rects: VisibleOverlayRect[];
  overlayVisibility: CaptureExclusionOverlayVisibility;
};

export const VISIBLE_OVERLAY_SELECTOR = '.control-dock, .panel.panel--open';
const VISIBLE_OVERLAY_MUTATION_SELECTOR = '.control-dock, .panel';

function toIntegerRect(element: Element): VisibleOverlayRect | null {
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

function mergeRows(rows: VisibleOverlayRect[]): VisibleOverlayRect[] {
  const merged: VisibleOverlayRect[] = [];

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

function toCapsuleRegions(rect: VisibleOverlayRect): VisibleOverlayRect[] {
  const radius = Math.min(Math.floor(rect.width / 2), Math.floor(rect.height / 2));
  if (radius <= 1) {
    return [rect];
  }

  const rows: VisibleOverlayRect[] = [];

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

export function toVisibleOverlayRects(element: Element): VisibleOverlayRect[] {
  const rect = toIntegerRect(element);
  if (!rect) {
    return [];
  }

  // The dock is rendered as a pill; keeping a capsule approximation preserves
  // the visible overlay shape for both hit regions and future frame exclusion.
  if (element.matches('.control-dock')) {
    return toCapsuleRegions(rect);
  }

  return [rect];
}

export function collectVisibleOverlayRects(root: ParentNode = document): VisibleOverlayRect[] {
  return collectVisibleOverlaySnapshot(root).rects;
}

export function collectVisibleOverlaySnapshot(root: ParentNode = document): VisibleOverlaySnapshot {
  let hasVisibleDock = false;
  let hasVisibleOpenPanel = false;
  const rects: VisibleOverlayRect[] = [];

  for (const element of Array.from(root.querySelectorAll(VISIBLE_OVERLAY_SELECTOR))) {
    const nextRects = toVisibleOverlayRects(element);

    if (nextRects.length === 0) {
      continue;
    }

    if (element.matches('.panel.panel--open')) {
      hasVisibleOpenPanel = true;
    }

    if (element.matches('.control-dock')) {
      hasVisibleDock = true;
    }

    rects.push(...nextRects);
  }

  return {
    rects,
    overlayVisibility: hasVisibleOpenPanel
      ? 'panel-open'
      : hasVisibleDock
        ? 'panel-closed-dock-only'
        : 'hidden',
  };
}

function isVisibleOverlayRelatedElement(element: Element): boolean {
  return (
    element.matches(VISIBLE_OVERLAY_MUTATION_SELECTOR) ||
    element.querySelector(VISIBLE_OVERLAY_MUTATION_SELECTOR) !== null
  );
}

export function shouldCollectVisibleOverlayRectsForMutation(records: MutationRecord[]): boolean {
  return records.some((record) => {
    if (record.target instanceof Element && isVisibleOverlayRelatedElement(record.target)) {
      return true;
    }

    if (record.type !== 'childList') {
      return false;
    }

    return [...record.addedNodes, ...record.removedNodes].some(
      (node) => node instanceof Element && isVisibleOverlayRelatedElement(node),
    );
  });
}
