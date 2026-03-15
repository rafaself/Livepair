import { create } from 'zustand';
import type { OverlayHitRegion } from '../../shared/desktopBridge';
import type { CaptureExclusionOverlayVisibility } from '../runtime/public';

type CaptureExclusionRectsStoreState = {
  rects: OverlayHitRegion[];
  overlayVisibility: CaptureExclusionOverlayVisibility;
  setSnapshot: (
    rects: OverlayHitRegion[],
    overlayVisibility: CaptureExclusionOverlayVisibility,
  ) => void;
  reset: () => void;
};

const defaultCaptureExclusionRectsState = {
  rects: [] as OverlayHitRegion[],
  overlayVisibility: 'hidden' as const,
};

export const useCaptureExclusionRectsStore = create<CaptureExclusionRectsStoreState>((set) => ({
  ...defaultCaptureExclusionRectsState,
  setSnapshot: (rects, overlayVisibility) => set({ rects, overlayVisibility }),
  reset: () => set(defaultCaptureExclusionRectsState),
}));
