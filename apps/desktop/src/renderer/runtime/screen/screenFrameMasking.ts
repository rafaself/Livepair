import type {
  OverlayHitRegion,
  ScreenCaptureOverlayDisplay,
  ScreenCaptureSource,
} from '../../../shared';
import type {
  CaptureExclusionOverlayVisibility,
  ScreenCaptureMaskReason,
} from './screen.types';

type CanvasMaskRect = OverlayHitRegion;

type MaskCanvasContext = {
  fillStyle: string;
  fillRect: (x: number, y: number, width: number, height: number) => void;
};

export type CaptureExclusionMaskingContext = {
  exclusionRects: OverlayHitRegion[];
  overlayVisibility: CaptureExclusionOverlayVisibility;
  overlayDisplay: ScreenCaptureOverlayDisplay | null;
  selectedSource: ScreenCaptureSource | null;
};

type GetCaptureExclusionMaskRectsArgs = CaptureExclusionMaskingContext & {
  canvasWidth: number;
  canvasHeight: number;
};

export type CaptureExclusionMaskAnalysis = {
  maskRects: CanvasMaskRect[];
  overlayMaskActive: boolean;
  maskedRectCount: number;
  maskReason: ScreenCaptureMaskReason;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function createInactiveMaskAnalysis(
  maskReason: ScreenCaptureMaskReason,
): CaptureExclusionMaskAnalysis {
  return {
    maskRects: [],
    overlayMaskActive: false,
    maskedRectCount: 0,
    maskReason,
  };
}

export function analyzeCaptureExclusionMask({
  canvasWidth,
  canvasHeight,
  exclusionRects,
  overlayVisibility,
  overlayDisplay,
  selectedSource,
}: GetCaptureExclusionMaskRectsArgs): CaptureExclusionMaskAnalysis {
  if (selectedSource?.kind === 'window') {
    return createInactiveMaskAnalysis('window-source');
  }

  if (overlayDisplay === null) {
    return createInactiveMaskAnalysis('missing-overlay-display');
  }

  if (
    selectedSource?.kind !== 'screen'
    || typeof selectedSource.displayId !== 'string'
    || selectedSource.displayId !== overlayDisplay.displayId
  ) {
    return createInactiveMaskAnalysis('other-display');
  }

  if (overlayVisibility === 'hidden') {
    return createInactiveMaskAnalysis('hidden');
  }

  if (
    exclusionRects.length === 0
    || canvasWidth <= 0
    || canvasHeight <= 0
    || overlayDisplay.bounds.width <= 0
    || overlayDisplay.bounds.height <= 0
  ) {
    return createInactiveMaskAnalysis('no-rects');
  }

  const scaleX = canvasWidth / overlayDisplay.bounds.width;
  const scaleY = canvasHeight / overlayDisplay.bounds.height;
  const workAreaOffsetX = overlayDisplay.workArea.x - overlayDisplay.bounds.x;
  const workAreaOffsetY = overlayDisplay.workArea.y - overlayDisplay.bounds.y;

  const maskRects = exclusionRects.flatMap((rect) => {
    const leftPx = (rect.x + workAreaOffsetX) * scaleX;
    const topPx = (rect.y + workAreaOffsetY) * scaleY;
    const rightPx = (rect.x + rect.width + workAreaOffsetX) * scaleX;
    const bottomPx = (rect.y + rect.height + workAreaOffsetY) * scaleY;

    const x = clamp(Math.floor(leftPx), 0, canvasWidth);
    const y = clamp(Math.floor(topPx), 0, canvasHeight);
    const right = clamp(Math.ceil(rightPx), 0, canvasWidth);
    const bottom = clamp(Math.ceil(bottomPx), 0, canvasHeight);
    const width = right - x;
    const height = bottom - y;

    if (width <= 0 || height <= 0) {
      return [];
    }

    return [{ x, y, width, height }];
  });

  if (maskRects.length === 0) {
    return createInactiveMaskAnalysis('no-rects');
  }

  return {
    maskRects,
    overlayMaskActive: true,
    maskedRectCount: maskRects.length,
    maskReason: overlayVisibility,
  };
}

export function getCaptureExclusionMaskRects(
  args: GetCaptureExclusionMaskRectsArgs,
): CanvasMaskRect[] {
  return analyzeCaptureExclusionMask(args).maskRects;
}

export function applyCaptureExclusionMask(
  ctx: MaskCanvasContext,
  args: GetCaptureExclusionMaskRectsArgs,
): CaptureExclusionMaskAnalysis {
  const analysis = analyzeCaptureExclusionMask(args);

  if (!analysis.overlayMaskActive) {
    return analysis;
  }

  ctx.fillStyle = '#000';
  for (const rect of analysis.maskRects) {
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  return analysis;
}
