import { useCallback } from 'react';
import type { OverlayHitRegion } from '../../shared/desktopBridge';
import type { CaptureExclusionOverlayVisibility } from '../runtime/liveRuntime';
import { useCaptureExclusionRectsStore } from '../store/captureExclusionRectsStore';
import { useVisibleOverlayRects } from './useVisibleOverlayRects';

export function useCaptureExclusionRects(): void {
  const setSnapshot = useCaptureExclusionRectsStore((state) => state.setSnapshot);
  const handleVisibleOverlayRectsChange = useCallback(
    (
      rects: OverlayHitRegion[],
      overlayVisibility: CaptureExclusionOverlayVisibility,
    ) => {
      setSnapshot(rects, overlayVisibility);
    },
    [setSnapshot],
  );

  useVisibleOverlayRects({
    onChange: handleVisibleOverlayRectsChange,
  });
}
