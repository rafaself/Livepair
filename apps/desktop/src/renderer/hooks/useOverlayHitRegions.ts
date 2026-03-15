import { useCallback } from 'react';
import type { OverlayHitRegion } from '../../shared/desktopBridge';
import { useVisibleOverlayRects } from './useVisibleOverlayRects';

export function useOverlayHitRegions(): void {
  const handleVisibleOverlayRectsChange = useCallback((rects: OverlayHitRegion[]) => {
    void window.bridge?.setOverlayHitRegions(rects);
  }, []);

  useVisibleOverlayRects({
    enabled: window.bridge?.overlayMode === 'linux-shape',
    onChange: handleVisibleOverlayRectsChange,
  });
}
