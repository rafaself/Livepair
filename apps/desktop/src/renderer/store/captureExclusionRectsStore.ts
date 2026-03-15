import { create } from 'zustand';
import type { OverlayHitRegion } from '../../shared/desktopBridge';

type CaptureExclusionRectsStoreState = {
  rects: OverlayHitRegion[];
  setRects: (rects: OverlayHitRegion[]) => void;
  reset: () => void;
};

const defaultCaptureExclusionRectsState = {
  rects: [] as OverlayHitRegion[],
};

export const useCaptureExclusionRectsStore = create<CaptureExclusionRectsStoreState>((set) => ({
  ...defaultCaptureExclusionRectsState,
  setRects: (rects) => set({ rects }),
  reset: () => set(defaultCaptureExclusionRectsState),
}));
