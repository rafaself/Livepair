import { useEffect } from 'react';
import type { OverlayHitRegion } from '../../preload/preload';

const SELECTOR = '.control-dock, .panel.panel--open';

function toOverlayHitRegion(element: Element): OverlayHitRegion | null {
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

export function useOverlayHitRegions(): void {
  useEffect(() => {
    let rafId: number | null = null;

    const publishHitRegions = (): void => {
      const regions = Array.from(document.querySelectorAll(SELECTOR))
        .map(toOverlayHitRegion)
        .filter((entry): entry is OverlayHitRegion => entry !== null);

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

    const handleTransitionEnd = (event: Event): void => {
      if (!(event.target instanceof Element)) {
        return;
      }
      if (!event.target.matches(SELECTOR)) {
        return;
      }
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
    document.addEventListener('transitionend', handleTransitionEnd, true);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      mutationObserver.disconnect();
      window.removeEventListener('resize', schedulePublish);
      document.removeEventListener('transitionend', handleTransitionEnd, true);
      void window.bridge?.setOverlayHitRegions([]);
    };
  }, []);
}
