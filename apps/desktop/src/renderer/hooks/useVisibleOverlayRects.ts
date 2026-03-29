import { useEffect } from 'react';
import type { OverlayHitRegion } from '../../shared/desktopBridge';
import {
  collectVisibleOverlaySnapshot,
  shouldCollectVisibleOverlayRectsForMutation,
  toVisibleOverlayRects,
  VISIBLE_OVERLAY_SELECTOR,
} from './visibleOverlayRects';
import type { CaptureExclusionOverlayVisibility } from '../runtime/liveRuntime';

// Track .panel elements during their closing transition (after panel--open is removed).
// The CSS transform transition plays for ~200ms after the class change, so the panel
// remains visually on-screen even though it no longer matches VISIBLE_OVERLAY_SELECTOR.
const PANEL_CLOSING_SELECTOR = '.panel';

const EMPTY_VISIBLE_OVERLAY_SNAPSHOT_KEY = JSON.stringify({
  rects: [],
  overlayVisibility: 'hidden',
});

type UseVisibleOverlayRectsOptions = {
  enabled?: boolean;
  onChange: (
    rects: OverlayHitRegion[],
    overlayVisibility: CaptureExclusionOverlayVisibility,
  ) => void;
};

export function useVisibleOverlayRects({
  enabled = true,
  onChange,
}: UseVisibleOverlayRectsOptions): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    let rafId: number | null = null;
    let transitionLoopId: number | null = null;
    const transitioningElements = new Set<Element>();
    const closingPanelTransitions = new Set<Element>();
    let lastPublishedKey: string | null = null;

    const publishVisibleOverlayRects = (): void => {
      const snapshot = collectVisibleOverlaySnapshot();

      // Include rects from panels that are in their closing CSS transition.
      // These no longer match VISIBLE_OVERLAY_SELECTOR (panel--open was removed)
      // but are still visually on-screen while the transform animates.
      const closingRects = Array.from(closingPanelTransitions)
        .filter((panel) => !panel.matches(VISIBLE_OVERLAY_SELECTOR))
        .flatMap((panel) => toVisibleOverlayRects(panel));

      const finalRects = closingRects.length > 0 ? [...snapshot.rects, ...closingRects] : snapshot.rects;
      const finalVisibility: CaptureExclusionOverlayVisibility =
        closingRects.length > 0 && snapshot.overlayVisibility === 'hidden'
          ? 'panel-closed-dock-only'
          : snapshot.overlayVisibility;

      const nextKey = JSON.stringify({ rects: finalRects, overlayVisibility: finalVisibility });

      if (nextKey === lastPublishedKey) {
        return;
      }

      lastPublishedKey = nextKey;
      onChange(finalRects, finalVisibility);
    };

    const schedulePublish = (): void => {
      if (rafId !== null) {
        return;
      }
      rafId = -1;
      const nextRafId = window.requestAnimationFrame(() => {
        rafId = null;
        publishVisibleOverlayRects();
      });
      if (rafId === -1) {
        rafId = nextRafId;
      }
    };

    const runTransitionLoop = (): void => {
      transitionLoopId = null;
      if (transitioningElements.size === 0) {
        return;
      }

      publishVisibleOverlayRects();
      transitionLoopId = window.requestAnimationFrame(runTransitionLoop);
    };

    const ensureTransitionLoop = (): void => {
      if (transitionLoopId !== null) {
        return;
      }

      transitionLoopId = -1;
      const nextTransitionLoopId = window.requestAnimationFrame(runTransitionLoop);
      if (transitionLoopId === -1) {
        transitionLoopId = nextTransitionLoopId;
      }
    };

    const getTransitioningDock = (target: Element): Element | null => (
      target.matches('.control-dock') ? target : target.closest('.control-dock')
    );

    const handleTransitionRun = (event: Event): void => {
      if (!(event.target instanceof Element)) {
        return;
      }

      const target = event.target;

      if (target.matches(VISIBLE_OVERLAY_SELECTOR)) {
        transitioningElements.add(target);
        ensureTransitionLoop();
        schedulePublish();
        return;
      }

      if (target.matches(PANEL_CLOSING_SELECTOR)) {
        // Panel is closing: panel--open was removed but the CSS transform is still animating.
        // Track it so its rects remain in the masking snapshot until transitionend.
        closingPanelTransitions.add(target);
        schedulePublish();
        return;
      }

      const transitioningDock = getTransitioningDock(target);
      if (!transitioningDock) {
        return;
      }

      transitioningElements.add(transitioningDock);
      ensureTransitionLoop();
      schedulePublish();
    };

    const handleTransitionEnd = (event: Event): void => {
      if (!(event.target instanceof Element)) {
        return;
      }

      const target = event.target;
      const transitioningDock = getTransitioningDock(target);

      if (
        !target.matches(VISIBLE_OVERLAY_SELECTOR) &&
        !target.matches(PANEL_CLOSING_SELECTOR) &&
        !transitioningDock
      ) {
        return;
      }

      transitioningElements.delete(target);
      if (transitioningDock) {
        transitioningElements.delete(transitioningDock);
      }
      closingPanelTransitions.delete(target);
      schedulePublish();
    };

    publishVisibleOverlayRects();

    const mutationObserver = new MutationObserver((records) => {
      if (!shouldCollectVisibleOverlayRectsForMutation(records)) {
        return;
      }
      schedulePublish();
    });
    mutationObserver.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });

    window.addEventListener('resize', schedulePublish);
    document.addEventListener('transitionrun', handleTransitionRun, true);
    document.addEventListener('transitionend', handleTransitionEnd, true);
    document.addEventListener('transitioncancel', handleTransitionEnd, true);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      if (transitionLoopId !== null) {
        window.cancelAnimationFrame(transitionLoopId);
      }
      mutationObserver.disconnect();
      window.removeEventListener('resize', schedulePublish);
      document.removeEventListener('transitionrun', handleTransitionRun, true);
      document.removeEventListener('transitionend', handleTransitionEnd, true);
      document.removeEventListener('transitioncancel', handleTransitionEnd, true);
      if (lastPublishedKey !== EMPTY_VISIBLE_OVERLAY_SNAPSHOT_KEY) {
        onChange([], 'hidden');
      }
    };
  }, [enabled, onChange]);
}
