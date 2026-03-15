import type {
  OverlayHitRegion,
  ScreenCaptureOverlayDisplay,
  ScreenCaptureSource,
} from '../../../shared';

type CanvasMaskRect = OverlayHitRegion;

type MaskCanvasContext = {
  fillStyle: string;
  fillRect: (x: number, y: number, width: number, height: number) => void;
};

export type CaptureExclusionMaskingContext = {
  exclusionRects: OverlayHitRegion[];
  overlayDisplay: ScreenCaptureOverlayDisplay | null;
  selectedSource: ScreenCaptureSource | null;
};

type GetCaptureExclusionMaskRectsArgs = CaptureExclusionMaskingContext & {
  canvasWidth: number;
  canvasHeight: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function shouldApplyCaptureExclusionMask(
  context: CaptureExclusionMaskingContext,
): context is CaptureExclusionMaskingContext & {
  overlayDisplay: ScreenCaptureOverlayDisplay;
  selectedSource: ScreenCaptureSource & { kind: 'screen'; displayId: string };
} {
  return context.exclusionRects.length > 0
    && context.overlayDisplay !== null
    && context.selectedSource?.kind === 'screen'
    && typeof context.selectedSource.displayId === 'string'
    && context.selectedSource.displayId === context.overlayDisplay.displayId;
}

export function getCaptureExclusionMaskRects({
  canvasWidth,
  canvasHeight,
  exclusionRects,
  overlayDisplay,
  selectedSource,
}: GetCaptureExclusionMaskRectsArgs): CanvasMaskRect[] {
  const maskingContext = { exclusionRects, overlayDisplay, selectedSource };

  if (
    canvasWidth <= 0
    || canvasHeight <= 0
    || !shouldApplyCaptureExclusionMask(maskingContext)
  ) {
    return [];
  }

  const matchedOverlayDisplay = maskingContext.overlayDisplay;

  if (
    matchedOverlayDisplay.bounds.width <= 0
    || matchedOverlayDisplay.bounds.height <= 0
  ) {
    return [];
  }

  const scaleX = canvasWidth / matchedOverlayDisplay.bounds.width;
  const scaleY = canvasHeight / matchedOverlayDisplay.bounds.height;
  const workAreaOffsetX = matchedOverlayDisplay.workArea.x - matchedOverlayDisplay.bounds.x;
  const workAreaOffsetY = matchedOverlayDisplay.workArea.y - matchedOverlayDisplay.bounds.y;

  return exclusionRects.flatMap((rect) => {
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
}

export function applyCaptureExclusionMask(
  ctx: MaskCanvasContext,
  args: GetCaptureExclusionMaskRectsArgs,
): void {
  const maskRects = getCaptureExclusionMaskRects(args);

  if (maskRects.length === 0) {
    return;
  }

  ctx.fillStyle = '#000';
  for (const rect of maskRects) {
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }
}
