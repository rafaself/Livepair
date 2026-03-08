const DEFAULT_MARGIN_PX = 8;
const DEFAULT_GAP_PX = 6;
const DEFAULT_MIN_WIDTH_PX = 0;
const DEFAULT_HORIZONTAL_ALIGN = 'start';
const DEFAULT_WIDTH_MODE = 'anchor';
const DEFAULT_FLIP_IN_LOWER_HALF_ONLY = true;

export type FloatingPlacement = 'up' | 'down';

export type FloatingPosition = {
  left: number;
  offset: number;
  width: number;
  maxHeight: number;
  placement: FloatingPlacement;
};

export type FloatingMeasurement = {
  triggerRect: DOMRect;
  viewportWidth: number;
  viewportHeight: number;
  contentHeight: number;
};

export type FloatingPositionOptions = {
  marginPx?: number;
  gapPx?: number;
  horizontalAlign?: 'start' | 'end';
  widthMode?: 'anchor' | 'minAnchor';
  minWidthPx?: number;
  maxWidthPx?: number;
  flipInLowerHalfOnly?: boolean;
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

export const estimateFloatingContentHeight = (
  itemCount: number,
  itemHeightPx = 32,
  verticalPaddingPx = 12,
): number => {
  return itemCount * itemHeightPx + verticalPaddingPx;
};

export const resolveFloatingPosition = (
  measurement: FloatingMeasurement,
  options: FloatingPositionOptions = {},
): FloatingPosition => {
  const marginPx = options.marginPx ?? DEFAULT_MARGIN_PX;
  const gapPx = options.gapPx ?? DEFAULT_GAP_PX;
  const horizontalAlign = options.horizontalAlign ?? DEFAULT_HORIZONTAL_ALIGN;
  const widthMode = options.widthMode ?? DEFAULT_WIDTH_MODE;
  const minWidthPx = options.minWidthPx ?? DEFAULT_MIN_WIDTH_PX;
  const flipInLowerHalfOnly = options.flipInLowerHalfOnly ?? DEFAULT_FLIP_IN_LOWER_HALF_ONLY;

  const anchorWidth = Math.max(0, Math.ceil(measurement.triggerRect.width));
  const rawWidth = widthMode === 'anchor' ? anchorWidth : Math.max(minWidthPx, anchorWidth);
  const maxWidthPx = options.maxWidthPx ?? Number.POSITIVE_INFINITY;
  const maxOverlayWidth = Math.min(maxWidthPx, Math.max(0, measurement.viewportWidth - marginPx * 2));
  const width = clamp(rawWidth, 0, maxOverlayWidth);
  const maxLeft = Math.max(marginPx, measurement.viewportWidth - marginPx - width);
  const left =
    horizontalAlign === 'end'
      ? clamp(measurement.triggerRect.right - width, marginPx, maxLeft)
      : clamp(measurement.triggerRect.left, marginPx, maxLeft);

  const availableBelow = Math.max(
    0,
    measurement.viewportHeight - measurement.triggerRect.bottom - gapPx - marginPx,
  );
  const availableAbove = Math.max(0, measurement.triggerRect.top - gapPx - marginPx);
  const cannotFitFullBelow = measurement.contentHeight > availableBelow;
  const upwardProvidesMoreSpace = availableAbove > availableBelow;
  const triggerIsInLowerHalf = measurement.triggerRect.top >= measurement.viewportHeight / 2;
  const openUpward =
    cannotFitFullBelow && upwardProvidesMoreSpace && (!flipInLowerHalfOnly || triggerIsInLowerHalf);

  if (openUpward) {
    const bottom = clamp(
      measurement.viewportHeight - measurement.triggerRect.top + gapPx,
      marginPx,
      measurement.viewportHeight - marginPx,
    );
    return {
      left,
      offset: bottom,
      width,
      maxHeight: Math.max(0, availableAbove),
      placement: 'up',
    };
  }

  const top = clamp(
    measurement.triggerRect.bottom + gapPx,
    marginPx,
    measurement.viewportHeight - marginPx,
  );
  return {
    left,
    offset: top,
    width,
    maxHeight: Math.max(0, availableBelow),
    placement: 'down',
  };
};
