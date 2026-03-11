export type ScreenCaptureState =
  | 'disabled'
  | 'requestingPermission'
  | 'ready'
  | 'capturing'
  | 'streaming'
  | 'stopping'
  | 'error';

export type ScreenFrameUploadStatus = 'idle' | 'sending' | 'sent' | 'error';

export type ScreenCaptureDiagnostics = {
  captureSource: string | null;
  frameCount: number;
  frameRateHz: number | null;
  widthPx: number | null;
  heightPx: number | null;
  lastFrameAt: string | null;
  lastUploadStatus: ScreenFrameUploadStatus;
  lastError: string | null;
};

export type LocalScreenFrame = {
  data: Uint8Array;
  mimeType: 'image/jpeg';
  sequence: number;
  widthPx: number;
  heightPx: number;
};
