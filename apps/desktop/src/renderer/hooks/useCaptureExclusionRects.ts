import { useCallback } from 'react';
import type { OverlayHitRegion } from '../../shared/desktopBridge';
import { useCaptureExclusionRectsStore } from '../store/captureExclusionRectsStore';
import { useVisibleOverlayRects } from './useVisibleOverlayRects';

export function useCaptureExclusionRects(): void {
  const setRects = useCaptureExclusionRectsStore((state) => state.setRects);
  const handleVisibleOverlayRectsChange = useCallback(
    (rects: OverlayHitRegion[]) => {
      setRects(rects);
    },
    [setRects],
  );

  useVisibleOverlayRects({
    onChange: handleVisibleOverlayRectsChange,
  });
}
