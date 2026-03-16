import type { ScreenFrameAnalysis } from './screenFrameAnalysis';

export type ScreenCaptureState =
  | 'disabled'
  | 'requestingPermission'
  | 'ready'
  | 'capturing'
  | 'stopping'
  | 'error';

export type ScreenFrameUploadStatus = 'idle' | 'sending' | 'sent' | 'error';

export type CaptureExclusionOverlayVisibility =
  | 'panel-open'
  | 'panel-closed-dock-only'
  | 'hidden';

export type ScreenCaptureMaskReason =
  | CaptureExclusionOverlayVisibility
  | 'window-source'
  | 'other-display'
  | 'missing-overlay-display'
  | 'no-rects';

export type ScreenCaptureDiagnostics = {
  captureSource: string | null;
  frameCount: number;
  frameRateHz: number | null;
  widthPx: number | null;
  heightPx: number | null;
  lastFrameAt: string | null;
  overlayMaskActive: boolean;
  maskedRectCount: number;
  lastMaskedFrameAt: string | null;
  maskReason: ScreenCaptureMaskReason;
  lastUploadStatus: ScreenFrameUploadStatus;
  lastError: string | null;
};

export type LocalScreenFrame = {
  data: Uint8Array;
  mimeType: 'image/jpeg';
  sequence: number;
  widthPx: number;
  heightPx: number;
  analysis: ScreenFrameAnalysis;
};
