export const SCREEN_CAPTURE_FRAME_RATE_HZ = 1;
export const SCREEN_CAPTURE_MAX_WIDTH_PX = 640;
export const SCREEN_CAPTURE_JPEG_QUALITY = 0.7;
export const SCREEN_CAPTURE_VIDEO_MIME_TYPE = 'image/jpeg' as const;

// Keep at most one unsent frame queued behind the current upload.
// If newer frames arrive first, they replace the older pending frame.
export const SCREEN_CAPTURE_MAX_PENDING_FRAMES = 1;

export const SCREEN_CAPTURE_START_POLICY = {
  frameRateHz: SCREEN_CAPTURE_FRAME_RATE_HZ,
  jpegQuality: SCREEN_CAPTURE_JPEG_QUALITY,
  maxWidthPx: SCREEN_CAPTURE_MAX_WIDTH_PX,
} as const;
