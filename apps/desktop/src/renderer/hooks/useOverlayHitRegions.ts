import { useEffect } from 'react';
import type { OverlayHitRegion } from '../../preload/preload';
import { toOverlayHitRegions } from './overlayHitRegions';

const SELECTOR = '.control-dock, .panel.panel--open';

export function useOverlayHitRegions(): void {
  useEffect(() => {
    let rafId: number | null = null;
    let transitionLoopId: number | null = null;
    const transitioningElements = new Set<Element>();

    const publishHitRegions = (): void => {
      const regions = Array.from(document.querySelectorAll(SELECTOR))
        .flatMap((element): OverlayHitRegion[] => toOverlayHitRegions(element));

      void window.bridge?.setOverlayHitRegions(regions);
    };

    const schedulePublish = (): void => {
      if (rafId !== null) {
        return;
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        publishHitRegions();
      });
    };

    const runTransitionLoop = (): void => {
      transitionLoopId = null;
      if (transitioningElements.size === 0) {
        return;
      }

      publishHitRegions();
      transitionLoopId = window.requestAnimationFrame(runTransitionLoop);
    };

    const ensureTransitionLoop = (): void => {
      if (transitionLoopId !== null) {
        return;
      }

      transitionLoopId = window.requestAnimationFrame(runTransitionLoop);
    };

    const handleTransitionRun = (event: Event): void => {
      if (!(event.target instanceof Element)) {
        return;
      }
      if (!event.target.matches(SELECTOR)) {
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
      if (!event.target.matches(SELECTOR)) {
        return;
      }

      transitioningElements.delete(event.target);
      schedulePublish();
    };

    publishHitRegions();

    const mutationObserver = new MutationObserver(() => {
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
      void window.bridge?.setOverlayHitRegions([]);
    };
  }, []);
}
