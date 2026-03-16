export const SCREEN_CAPTURE_FRAME_RATE_HZ = 1;
export const SCREEN_CAPTURE_MAX_WIDTH_PX = 1920;
export const SCREEN_CAPTURE_JPEG_QUALITY = 0.92;
export const SCREEN_CAPTURE_VIDEO_MIME_TYPE = 'image/jpeg' as const;

// Keep at most one unsent frame queued behind the current upload.
// If newer frames arrive first, they replace the older pending frame.
export const SCREEN_CAPTURE_MAX_PENDING_FRAMES = 1;

export const SCREEN_CAPTURE_START_POLICY = {
  frameRateHz: SCREEN_CAPTURE_FRAME_RATE_HZ,
  jpegQuality: SCREEN_CAPTURE_JPEG_QUALITY,
  maxWidthPx: SCREEN_CAPTURE_MAX_WIDTH_PX,
} as const;

// ── Quality tier capture parameters ──────────────────────────────────────
//
// Maps the user-facing quality setting to local capture encoding parameters.
// These affect frame resolution and JPEG compression quality at the
// capture level, independent of the API-side media resolution config.

export type ScreenCaptureQualityParams = {
  maxWidthPx: number;
  jpegQuality: number;
};

export function getScreenCaptureQualityParams(
  quality: 'low' | 'medium' | 'high',
): ScreenCaptureQualityParams {
  switch (quality) {
    case 'low':
      return { maxWidthPx: 768, jpegQuality: 0.70 };
    case 'medium':
      return { maxWidthPx: 1280, jpegQuality: 0.85 };
    case 'high':
      return { maxWidthPx: SCREEN_CAPTURE_MAX_WIDTH_PX, jpegQuality: SCREEN_CAPTURE_JPEG_QUALITY };
  }
}
