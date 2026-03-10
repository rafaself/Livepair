import type { LocalScreenFrame, ScreenCaptureDiagnostics } from './types';

export const SCREEN_CAPTURE_FRAME_RATE_HZ = 1;
export const SCREEN_CAPTURE_MAX_WIDTH_PX = 640;
export const SCREEN_CAPTURE_JPEG_QUALITY = 0.7;
export const SCREEN_CAPTURE_VIDEO_MIME_TYPE = 'image/jpeg' as const;

type CanvasLike = {
  width: number;
  height: number;
  getContext: (type: '2d') => CanvasRenderingContext2DLike | null;
  toDataURL: (type: string, quality: number) => string;
};

type CanvasRenderingContext2DLike = {
  drawImage: (image: HTMLVideoElement, sx: number, sy: number, sw: number, sh: number) => void;
};

type VideoElementLike = {
  srcObject: MediaStream | null;
  videoWidth: number;
  videoHeight: number;
  play: () => Promise<void>;
  pause: () => void;
};

type TrackLike = {
  stop: () => void;
  addEventListener: (type: 'ended', listener: () => void) => void;
  removeEventListener: (type: 'ended', listener: () => void) => void;
};

export type LocalScreenCaptureObserver = {
  onFrame: (frame: LocalScreenFrame) => void;
  onDiagnostics: (diagnostics: Partial<ScreenCaptureDiagnostics>) => void;
  onError: (detail: string) => void;
};

export type LocalScreenCapture = {
  start: (options: {
    frameRateHz?: number;
    jpegQuality?: number;
    maxWidthPx?: number;
  }) => Promise<void>;
  stop: () => Promise<void>;
};

export type CreateLocalScreenCaptureDependencies = {
  getDisplayMedia?: () => Promise<MediaStream>;
  createCanvas?: () => CanvasLike;
  createVideoElement?: () => VideoElementLike;
  createInterval?: (callback: () => void, intervalMs: number) => () => void;
};

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function stripDataUrlPrefix(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(',');

  if (commaIndex === -1) {
    return dataUrl;
  }

  return dataUrl.slice(commaIndex + 1);
}

function defaultGetDisplayMedia(): Promise<MediaStream> {
  return navigator.mediaDevices.getDisplayMedia({ video: true });
}

function defaultCreateCanvas(): CanvasLike {
  return document.createElement('canvas') as unknown as CanvasLike;
}

function defaultCreateVideoElement(): VideoElementLike {
  return document.createElement('video') as unknown as VideoElementLike;
}

function defaultCreateInterval(callback: () => void, intervalMs: number): () => void {
  const id = setInterval(callback, intervalMs);

  return () => {
    clearInterval(id);
  };
}

export function createLocalScreenCapture(
  observer: LocalScreenCaptureObserver,
  {
    getDisplayMedia = defaultGetDisplayMedia,
    createCanvas = defaultCreateCanvas,
    createVideoElement = defaultCreateVideoElement,
    createInterval = defaultCreateInterval,
  }: CreateLocalScreenCaptureDependencies = {},
): LocalScreenCapture {
  let isCapturing = false;
  let sequence = 0;
  let stream: MediaStream | null = null;
  let stopInterval: (() => void) | null = null;
  let videoEl: VideoElementLike | null = null;
  let canvas: CanvasLike | null = null;
  let trackEndedListener: (() => void) | null = null;
  let activeTrack: TrackLike | null = null;

  function releaseResources(): void {
    if (stopInterval) {
      stopInterval();
      stopInterval = null;
    }

    if (videoEl) {
      videoEl.pause();
      videoEl.srcObject = null;
      videoEl = null;
    }

    canvas = null;

    if (activeTrack && trackEndedListener) {
      activeTrack.removeEventListener('ended', trackEndedListener);
    }

    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }

      stream = null;
    }

    activeTrack = null;
    trackEndedListener = null;
  }

  function captureFrame(
    video: VideoElementLike,
    cvs: CanvasLike,
    jpegQuality: number,
  ): void {
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    if (videoWidth === 0 || videoHeight === 0) {
      return;
    }

    const dataUrl = cvs.toDataURL(SCREEN_CAPTURE_VIDEO_MIME_TYPE, jpegQuality);
    const base64 = stripDataUrlPrefix(dataUrl);

    if (base64.length === 0) {
      return;
    }

    let data: Uint8Array;

    try {
      data = base64ToUint8Array(base64);
    } catch {
      observer.onError('Screen frame encoding failed');
      return;
    }

    sequence += 1;
    const frame: LocalScreenFrame = {
      data,
      mimeType: SCREEN_CAPTURE_VIDEO_MIME_TYPE,
      sequence,
      widthPx: cvs.width,
      heightPx: cvs.height,
    };

    observer.onFrame(frame);
    observer.onDiagnostics({
      frameCount: sequence,
      widthPx: cvs.width,
      heightPx: cvs.height,
    });
  }

  const start = async (options: {
    frameRateHz?: number;
    jpegQuality?: number;
    maxWidthPx?: number;
  } = {}): Promise<void> => {
    if (isCapturing) {
      throw new Error('Screen capture is already active');
    }

    const frameRateHz = Math.min(options.frameRateHz ?? SCREEN_CAPTURE_FRAME_RATE_HZ, 2);
    const jpegQuality = options.jpegQuality ?? SCREEN_CAPTURE_JPEG_QUALITY;
    const maxWidthPx = options.maxWidthPx ?? SCREEN_CAPTURE_MAX_WIDTH_PX;
    const intervalMs = Math.round(1000 / frameRateHz);

    let capturedStream: MediaStream;

    try {
      capturedStream = await getDisplayMedia();
    } catch (error: unknown) {
      const isPermissionDenied =
        error instanceof Error &&
        (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError');
      const detail = isPermissionDenied
        ? 'Screen capture permission was denied'
        : error instanceof Error && error.message.length > 0
          ? error.message
          : 'Screen capture failed';
      observer.onError(detail);
      throw new Error(detail);
    }

    stream = capturedStream;
    isCapturing = true;

    const video = createVideoElement();
    video.srcObject = capturedStream;
    videoEl = video;

    const cvs = createCanvas();
    canvas = cvs;

    const tracks = capturedStream.getTracks() as TrackLike[];
    const videoTrack = tracks[0] ?? null;

    if (videoTrack) {
      activeTrack = videoTrack;
      trackEndedListener = () => {
        if (!isCapturing) {
          return;
        }

        isCapturing = false;
        releaseResources();
        observer.onError('Screen capture source ended unexpectedly');
      };
      videoTrack.addEventListener('ended', trackEndedListener);
    }

    try {
      await video.play();
    } catch {
      isCapturing = false;
      releaseResources();
      observer.onError('Screen capture video playback failed');
      throw new Error('Screen capture video playback failed');
    }

    observer.onDiagnostics({
      frameRateHz,
      frameCount: 0,
      widthPx: null,
      heightPx: null,
      lastError: null,
    });

    stopInterval = createInterval(() => {
      if (!isCapturing || !videoEl || !canvas) {
        return;
      }

      const vw = videoEl.videoWidth;
      const vh = videoEl.videoHeight;

      if (vw === 0 || vh === 0) {
        return;
      }

      const targetWidth = Math.min(vw, maxWidthPx);
      const targetHeight = Math.round((vh / vw) * targetWidth);

      if (targetWidth !== canvas.width || targetHeight !== canvas.height) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      const ctx = canvas.getContext('2d');

      if (!ctx) {
        return;
      }

      ctx.drawImage(videoEl as unknown as HTMLVideoElement, 0, 0, targetWidth, targetHeight);
      captureFrame(videoEl, canvas, jpegQuality);
    }, intervalMs);
  };

  const stop = async (): Promise<void> => {
    if (!isCapturing) {
      return;
    }

    isCapturing = false;
    releaseResources();
    sequence = 0;
  };

  return { start, stop };
}
