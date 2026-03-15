import type { LocalScreenFrame, ScreenCaptureDiagnostics } from './screen.types';
import type { ScreenCaptureAccessStatus } from '../../../shared';
import {
  SCREEN_CAPTURE_FRAME_RATE_HZ,
  SCREEN_CAPTURE_JPEG_QUALITY,
  SCREEN_CAPTURE_MAX_WIDTH_PX,
  SCREEN_CAPTURE_VIDEO_MIME_TYPE,
} from './screenCapturePolicy';
import { mapScreenCaptureStartError } from './screenCaptureStartError';
import {
  applyCaptureExclusionMask,
} from './screenFrameMasking';
import type { CaptureExclusionMaskingContext } from './screenFrameMasking';
import type { CaptureExclusionMaskAnalysis } from './screenFrameMasking';

export {
  SCREEN_CAPTURE_FRAME_RATE_HZ,
  SCREEN_CAPTURE_JPEG_QUALITY,
  SCREEN_CAPTURE_MAX_WIDTH_PX,
  SCREEN_CAPTURE_VIDEO_MIME_TYPE,
} from './screenCapturePolicy';

type CanvasLike = {
  width: number;
  height: number;
  getContext: (type: '2d') => CanvasRenderingContext2DLike | null;
  toBlob: (callback: BlobCallback, type?: string, quality?: number) => void;
};

type CanvasRenderingContext2DLike = {
  drawImage: (image: HTMLVideoElement, sx: number, sy: number, sw: number, sh: number) => void;
  fillStyle: string;
  fillRect: (x: number, y: number, width: number, height: number) => void;
};

type VideoElementLike = {
  srcObject: MediaStream | null;
  videoWidth: number;
  videoHeight: number;
  play: () => Promise<void>;
  pause: () => void;
};

type TrackLike = {
  label?: string;
  stop: () => void;
  addEventListener: (type: 'ended', listener: () => void) => void;
  removeEventListener: (type: 'ended', listener: () => void) => void;
  getSettings: () => { width?: number; height?: number };
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
  /** Update capture quality parameters mid-session. Takes effect on the next frame. */
  updateQuality: (params: { jpegQuality?: number; maxWidthPx?: number }) => void;
};

export type CreateLocalScreenCaptureDependencies = {
  getDisplayMedia?: () => Promise<MediaStream>;
  getScreenCaptureAccessStatus?: () => Promise<ScreenCaptureAccessStatus>;
  createCanvas?: () => CanvasLike;
  createVideoElement?: () => VideoElementLike;
  createInterval?: (callback: () => void, intervalMs: number) => () => void;
  getCaptureExclusionMaskingContext?: () => CaptureExclusionMaskingContext;
};

function defaultGetCaptureExclusionMaskingContext(): CaptureExclusionMaskingContext {
  return {
    exclusionRects: [],
    overlayVisibility: 'hidden',
    overlayDisplay: null,
    selectedSource: null,
  };
}

async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    const arrayBuffer = await blob.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(new Error('Screen frame encoding failed'));
    };
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error('Screen frame encoding failed'));
        return;
      }

      resolve(new Uint8Array(reader.result));
    };
    reader.readAsArrayBuffer(blob);
  });
}

function encodeCanvasFrame(cvs: CanvasLike, jpegQuality: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    cvs.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Screen frame encoding failed'));
          return;
        }

        void blobToUint8Array(blob).then(resolve, () => {
          reject(new Error('Screen frame encoding failed'));
        });
      },
      SCREEN_CAPTURE_VIDEO_MIME_TYPE,
      jpegQuality,
    );
  });
}

function defaultGetDisplayMedia(): Promise<MediaStream> {
  return navigator.mediaDevices.getDisplayMedia({ video: true });
}

function defaultGetScreenCaptureAccessStatus(): Promise<ScreenCaptureAccessStatus> {
  return window.bridge.getScreenCaptureAccessStatus();
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

function shouldClearLastMaskedFrameAt(maskAnalysis: CaptureExclusionMaskAnalysis): boolean {
  return maskAnalysis.maskReason === 'window-source'
    || maskAnalysis.maskReason === 'other-display'
    || maskAnalysis.maskReason === 'missing-overlay-display';
}

export function createLocalScreenCapture(
  observer: LocalScreenCaptureObserver,
  {
    getDisplayMedia = defaultGetDisplayMedia,
    getScreenCaptureAccessStatus = defaultGetScreenCaptureAccessStatus,
    createCanvas = defaultCreateCanvas,
    createVideoElement = defaultCreateVideoElement,
    createInterval = defaultCreateInterval,
    getCaptureExclusionMaskingContext = defaultGetCaptureExclusionMaskingContext,
  }: CreateLocalScreenCaptureDependencies = {},
): LocalScreenCapture {
  let isCapturing = false;
  let isStarting = false;
  let sequence = 0;
  let stream: MediaStream | null = null;
  let stopInterval: (() => void) | null = null;
  let videoEl: VideoElementLike | null = null;
  let canvas: CanvasLike | null = null;
  let trackEndedListener: (() => void) | null = null;
  let activeTrack: TrackLike | null = null;
  let pendingStart: Promise<void> | null = null;
  let stopRequested = false;
  let captureGeneration = 0;

  // Mutable quality parameters — updated by start() and updateQuality().
  let currentJpegQuality = SCREEN_CAPTURE_JPEG_QUALITY;
  let currentMaxWidthPx = SCREEN_CAPTURE_MAX_WIDTH_PX;

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

    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
      canvas = null;
    }

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

  async function captureFrame(
    cvs: CanvasLike,
    jpegQuality: number,
    generation: number,
    maskAnalysis: CaptureExclusionMaskAnalysis,
  ): Promise<void> {
    let data: Uint8Array;

    try {
      data = await encodeCanvasFrame(cvs, jpegQuality);
    } catch {
      if (isCapturing && generation === captureGeneration) {
        observer.onError('Screen frame encoding failed');
      }
      return;
    }

    if (!isCapturing || generation !== captureGeneration || data.length === 0) {
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

    const frameTimestamp = new Date().toISOString();
    observer.onFrame(frame);
    observer.onDiagnostics({
      frameCount: sequence,
      widthPx: cvs.width,
      heightPx: cvs.height,
      lastFrameAt: frameTimestamp,
      overlayMaskActive: maskAnalysis.overlayMaskActive,
      maskedRectCount: maskAnalysis.maskedRectCount,
      maskReason: maskAnalysis.maskReason,
      ...(maskAnalysis.overlayMaskActive
        ? { lastMaskedFrameAt: frameTimestamp }
        : shouldClearLastMaskedFrameAt(maskAnalysis)
          ? { lastMaskedFrameAt: null }
        : {}),
    });
  }

  const start = async (options: {
    frameRateHz?: number;
    jpegQuality?: number;
    maxWidthPx?: number;
  } = {}): Promise<void> => {
    if (isCapturing || isStarting) {
      throw new Error('Screen capture is already active');
    }

    isStarting = true;
    stopRequested = false;

    pendingStart = (async () => {
      const requestedFrameRateHz = options.frameRateHz ?? SCREEN_CAPTURE_FRAME_RATE_HZ;
      const frameRateHz =
        Number.isFinite(requestedFrameRateHz) && requestedFrameRateHz > 0
          ? Math.min(requestedFrameRateHz, 2)
          : SCREEN_CAPTURE_FRAME_RATE_HZ;
      currentJpegQuality = options.jpegQuality ?? SCREEN_CAPTURE_JPEG_QUALITY;
      currentMaxWidthPx = options.maxWidthPx ?? SCREEN_CAPTURE_MAX_WIDTH_PX;
      const intervalMs = Math.round(1000 / frameRateHz);

      let capturedStream: MediaStream;

      try {
        capturedStream = await getDisplayMedia();
      } catch (error: unknown) {
        let accessStatus: ScreenCaptureAccessStatus | null = null;

        try {
          accessStatus = await getScreenCaptureAccessStatus();
        } catch {
          accessStatus = null;
        }

        const detail = mapScreenCaptureStartError(error, accessStatus);
        observer.onError(detail);
        throw new Error(detail);
      }

      if (stopRequested) {
        for (const track of capturedStream.getTracks()) {
          track.stop();
        }
        return;
      }

      stream = capturedStream;
      isCapturing = true;
      const sessionGeneration = ++captureGeneration;

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

      if (stopRequested) {
        isCapturing = false;
        releaseResources();
        return;
      }

      observer.onDiagnostics({
        captureSource: videoTrack?.label || null,
        frameRateHz,
        frameCount: 0,
        widthPx: null,
        heightPx: null,
        lastFrameAt: null,
        overlayMaskActive: false,
        maskedRectCount: 0,
        lastMaskedFrameAt: null,
        maskReason: 'hidden',
        lastUploadStatus: 'idle',
        lastError: null,
      });

      stopInterval = createInterval(async () => {
        if (!isCapturing || sessionGeneration !== captureGeneration) {
          return;
        }

        const settings = videoTrack?.getSettings() ?? {};
        const sourceWidth = (settings.width && settings.width > 0 ? settings.width : video.videoWidth);
        const sourceHeight = (settings.height && settings.height > 0 ? settings.height : video.videoHeight);
        const vw = sourceWidth;
        const vh = sourceHeight;

        if (vw === 0 || vh === 0) {
          return;
        }

        const targetWidth = Math.min(vw, currentMaxWidthPx);
        const targetHeight = Math.round((vh / vw) * targetWidth);

        if (targetWidth !== cvs.width || targetHeight !== cvs.height) {
          cvs.width = targetWidth;
          cvs.height = targetHeight;
        }

        const ctx = cvs.getContext('2d');

        if (!ctx) {
          return;
        }

        ctx.drawImage(video as unknown as HTMLVideoElement, 0, 0, targetWidth, targetHeight);
        const maskAnalysis = applyCaptureExclusionMask(ctx, {
          canvasWidth: cvs.width,
          canvasHeight: cvs.height,
          ...getCaptureExclusionMaskingContext(),
        });
        await captureFrame(cvs, currentJpegQuality, sessionGeneration, maskAnalysis);
      }, intervalMs);
    })();

    try {
      await pendingStart;
    } finally {
      isStarting = false;
      pendingStart = null;
    }
  };

  const stop = async (): Promise<void> => {
    stopRequested = true;

    if (pendingStart) {
      try {
        await pendingStart;
      } catch {
        // Startup failures have already been reported through the observer.
      }
    }

    if (!isCapturing) {
      releaseResources();
      sequence = 0;
      stopRequested = false;
      return;
    }

    isCapturing = false;
    releaseResources();
    sequence = 0;
    stopRequested = false;
  };

  const updateQuality = (params: { jpegQuality?: number; maxWidthPx?: number }): void => {
    if (params.jpegQuality !== undefined) currentJpegQuality = params.jpegQuality;
    if (params.maxWidthPx !== undefined) currentMaxWidthPx = params.maxWidthPx;
  };

  return { start, stop, updateQuality };
}
