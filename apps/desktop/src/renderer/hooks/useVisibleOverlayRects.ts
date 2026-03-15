import { useEffect } from 'react';
import type { OverlayHitRegion } from '../../shared/desktopBridge';
import {
  collectVisibleOverlaySnapshot,
  shouldCollectVisibleOverlayRectsForMutation,
  VISIBLE_OVERLAY_SELECTOR,
} from './visibleOverlayRects';
import type { CaptureExclusionOverlayVisibility } from '../runtime/public';

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
    let lastPublishedKey: string | null = null;

    const publishVisibleOverlayRects = (): void => {
      const snapshot = collectVisibleOverlaySnapshot();
      const nextKey = JSON.stringify(snapshot);

      if (nextKey === lastPublishedKey) {
        return;
      }

      lastPublishedKey = nextKey;
      onChange(snapshot.rects, snapshot.overlayVisibility);
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

    const handleTransitionRun = (event: Event): void => {
      if (!(event.target instanceof Element)) {
        return;
      }
      if (!event.target.matches(VISIBLE_OVERLAY_SELECTOR)) {
        return;
      }

      transitioningElements.add(event.target);
      ensureTransitionLoop();
      schedulePublish();
    };

    const handleTransitionEnd = (event: Event): void => {
      if (!(event.target instanceof Element)) {
        return;
      }
      if (!event.target.matches(VISIBLE_OVERLAY_SELECTOR)) {
        return;
      }

      transitioningElements.delete(event.target);
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
