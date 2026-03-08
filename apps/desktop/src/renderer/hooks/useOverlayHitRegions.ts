import { useEffect } from 'react';
import type { OverlayHitRegion } from '../../shared/desktopBridge';
import { toOverlayHitRegions } from './overlayHitRegions';

const SELECTOR = '.control-dock, .panel.panel--open';
const MUTATION_SELECTOR = '.control-dock, .panel';

function isOverlayRelatedElement(element: Element): boolean {
  return element.matches(MUTATION_SELECTOR) || element.querySelector(MUTATION_SELECTOR) !== null;
}

function shouldPublishForMutation(records: MutationRecord[]): boolean {
  return records.some((record) => {
    if (record.target instanceof Element && isOverlayRelatedElement(record.target)) {
      return true;
    }

    if (record.type !== 'childList') {
      return false;
    }

    return [...record.addedNodes, ...record.removedNodes].some(
      (node) => node instanceof Element && isOverlayRelatedElement(node),
    );
  });
}

export function useOverlayHitRegions(): void {
  useEffect(() => {
    if (window.bridge?.overlayMode !== 'linux-shape') {
      return;
    }

    let rafId: number | null = null;
    let transitionLoopId: number | null = null;
    const transitioningElements = new Set<Element>();
    let lastPublishedKey: string | null = null;

    const publishHitRegions = (): void => {
      const regions = Array.from(document.querySelectorAll(SELECTOR))
        .flatMap((element): OverlayHitRegion[] => toOverlayHitRegions(element));
      const nextKey = JSON.stringify(regions);

      if (nextKey === lastPublishedKey) {
        return;
      }

      lastPublishedKey = nextKey;

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

    const mutationObserver = new MutationObserver((records) => {
      if (!shouldPublishForMutation(records)) {
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
      if (lastPublishedKey !== '[]') {
        void window.bridge?.setOverlayHitRegions([]);
      }
    };
  }, []);
}
