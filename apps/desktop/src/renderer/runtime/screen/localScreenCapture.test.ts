import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CreateLocalScreenCaptureDependencies,
  LocalScreenCaptureObserver,
} from './localScreenCapture';
import {
  createLocalScreenCapture,
  SCREEN_CAPTURE_FRAME_RATE_HZ,
  SCREEN_CAPTURE_JPEG_QUALITY,
  SCREEN_CAPTURE_VIDEO_MIME_TYPE,
} from './localScreenCapture';
import type { ScreenCaptureAccessStatus } from '../../../shared';
import type { CaptureExclusionMaskingContext } from './screenFrameMasking';

type TrackLike = {
  label: string;
  stop: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  getSettings: ReturnType<typeof vi.fn>;
};

type CanvasMock = {
  width: number;
  height: number;
  getContext: ReturnType<typeof vi.fn>;
  toDataURL: ReturnType<typeof vi.fn>;
  toBlob: ReturnType<typeof vi.fn>;
};

type VideoMock = {
  srcObject: MediaStream | null;
  videoWidth: number;
  videoHeight: number;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
};

function createObserver(): {
  observer: LocalScreenCaptureObserver;
  onFrame: ReturnType<typeof vi.fn>;
  onDiagnostics: ReturnType<typeof vi.fn>;
  onError: ReturnType<typeof vi.fn>;
} {
  const onFrame = vi.fn();
  const onDiagnostics = vi.fn();
  const onError = vi.fn();

  return {
    observer: { onFrame, onDiagnostics, onError },
    onFrame,
    onDiagnostics,
    onError,
  };
}

function createTrack(trackWidth = 1280, trackHeight = 720): TrackLike {
  return {
    label: 'Entire screen',
    stop: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    getSettings: vi.fn(() => ({ width: trackWidth, height: trackHeight })),
  };
}

function makeFakeBase64Jpeg(): string {
  return btoa('fake-jpeg-data');
}

function createValidJpegBytes(): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xd9,
  ]);
}

function createUniformImageData(width: number, height: number, value = 96): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let index = 0; index < width * height; index += 1) {
    const channelIndex = index * 4;
    data[channelIndex] = value;
    data[channelIndex + 1] = value;
    data[channelIndex + 2] = value;
    data[channelIndex + 3] = 255;
  }

  return data;
}

function createHarness(opts: {
  getDisplayMediaImpl?: () => Promise<MediaStream>;
  accessStatus?: ScreenCaptureAccessStatus;
  videoWidth?: number;
  videoHeight?: number;
  trackWidth?: number;
  trackHeight?: number;
  toDataUrlResult?: string;
  blobBytes?: Uint8Array;
  maskingContext?: CaptureExclusionMaskingContext;
  analysisImageData?: Uint8ClampedArray;
} = {}): {
  capture: ReturnType<typeof createLocalScreenCapture>;
  obs: ReturnType<typeof createObserver>;
  deps: CreateLocalScreenCaptureDependencies;
  track: TrackLike;
  canvas: CanvasMock;
  analysisCanvas: CanvasMock;
  video: VideoMock;
  ctx2d: {
    drawImage: ReturnType<typeof vi.fn>;
    fillRect: ReturnType<typeof vi.fn>;
    fillStyle: string;
    getImageData: ReturnType<typeof vi.fn>;
  };
  analysisCtx2d: {
    drawImage: ReturnType<typeof vi.fn>;
    fillRect: ReturnType<typeof vi.fn>;
    fillStyle: string;
    getImageData: ReturnType<typeof vi.fn>;
  };
  tickInterval: () => Promise<void>;
  getDisplayMedia: ReturnType<typeof vi.fn>;
  getScreenCaptureAccessStatus: ReturnType<typeof vi.fn>;
  createInterval: ReturnType<typeof vi.fn>;
} {
  const obs = createObserver();
  const track = createTrack(opts.trackWidth ?? opts.videoWidth ?? 1280, opts.trackHeight ?? opts.videoHeight ?? 720);

  const fakeStream = {
    getTracks: () => [track as unknown as MediaStreamTrack],
  } as unknown as MediaStream;

  const getDisplayMedia = vi.fn(
    opts.getDisplayMediaImpl ?? (() => Promise.resolve(fakeStream)),
  );
  const getScreenCaptureAccessStatus = vi.fn(async () => (
    opts.accessStatus ?? { platform: 'linux', permissionStatus: null }
  ));

  let intervalCallback: (() => void) | null = null;
  const createInterval = vi.fn((cb: () => void, _ms: number) => {
    intervalCallback = cb;
    return vi.fn(() => {
      intervalCallback = null;
    });
  });

  const ctx2d = {
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
    getImageData: vi.fn(),
  };
  const analysisCtx2d = {
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
    getImageData: vi.fn((x: number, y: number, width: number, height: number) => ({
      data: opts.analysisImageData ?? createUniformImageData(width, height),
      width,
      height,
    })),
  };

  const canvas: CanvasMock = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx2d),
    toDataURL: vi.fn(
      () => `data:image/jpeg;base64,${opts.toDataUrlResult ?? makeFakeBase64Jpeg()}`,
    ),
    toBlob: vi.fn((callback: (blob: Blob | null) => void) => {
      const blobBytes = new Uint8Array(Array.from(opts.blobBytes ?? createValidJpegBytes()));
      callback(
        new Blob([blobBytes], {
          type: SCREEN_CAPTURE_VIDEO_MIME_TYPE,
        }),
      );
    }),
  };
  const analysisCanvas: CanvasMock = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => analysisCtx2d),
    toDataURL: vi.fn(),
    toBlob: vi.fn(),
  };

  const canvases = [canvas, analysisCanvas];
  const video: VideoMock = {
    srcObject: null,
    videoWidth: opts.videoWidth ?? 1280,
    videoHeight: opts.videoHeight ?? 720,
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
  };

  const deps: CreateLocalScreenCaptureDependencies = {
    getDisplayMedia: getDisplayMedia as unknown as () => Promise<MediaStream>,
    createCanvas: () => canvases.shift() as unknown as ReturnType<NonNullable<CreateLocalScreenCaptureDependencies['createCanvas']>>,
    createVideoElement: () => video as unknown as ReturnType<NonNullable<CreateLocalScreenCaptureDependencies['createVideoElement']>>,
    getScreenCaptureAccessStatus:
      getScreenCaptureAccessStatus as unknown as NonNullable<
        CreateLocalScreenCaptureDependencies['getScreenCaptureAccessStatus']
      >,
    createInterval:
      createInterval as unknown as NonNullable<
        CreateLocalScreenCaptureDependencies['createInterval']
      >,
    getCaptureExclusionMaskingContext: () => opts.maskingContext ?? {
      exclusionRects: [],
      overlayVisibility: 'hidden',
      overlayDisplay: null,
      selectedSource: null,
    },
  };

  const capture = createLocalScreenCapture(obs.observer, deps);

  return {
    capture,
    obs,
    deps,
    track,
    canvas,
    analysisCanvas,
    video,
    ctx2d,
    analysisCtx2d,
    tickInterval: async () => {
      await intervalCallback?.();
    },
    getDisplayMedia,
    getScreenCaptureAccessStatus,
    createInterval,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('createLocalScreenCapture', () => {
  describe('start()', () => {
    it('calls getDisplayMedia and plays the video', async () => {
      const { capture, getDisplayMedia, video } = createHarness();
      await capture.start({});
      expect(getDisplayMedia).toHaveBeenCalledOnce();
      expect(video.play).toHaveBeenCalledOnce();
    });

    it('emits onDiagnostics with initial state after start', async () => {
      const { capture, obs } = createHarness();
      await capture.start({ frameRateHz: 1 });
      expect(obs.onDiagnostics).toHaveBeenCalledWith(
        expect.objectContaining({
          captureSource: 'Entire screen',
          frameRateHz: 1,
          frameCount: 0,
          lastError: null,
          lastUploadStatus: 'idle',
        }),
      );
    });

    it('registers a track ended listener', async () => {
      const { capture, track } = createHarness();
      await capture.start({});
      expect(track.addEventListener).toHaveBeenCalledWith('ended', expect.any(Function));
    });

    it('throws and calls onError when getDisplayMedia is denied (NotAllowedError)', async () => {
      const err = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
      const { capture, obs } = createHarness({
        getDisplayMediaImpl: () => Promise.reject(err),
      });

      await expect(capture.start({})).rejects.toThrow('Screen capture permission was denied');
      expect(obs.onError).toHaveBeenCalledWith('Screen capture permission was denied');
    });

    it('uses main-process access status to explain macOS screen recording denial', async () => {
      const err = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
      const { capture, obs, getScreenCaptureAccessStatus } = createHarness({
        getDisplayMediaImpl: () => Promise.reject(err),
        accessStatus: {
          platform: 'darwin',
          permissionStatus: 'denied',
        },
      });

      await expect(capture.start({})).rejects.toThrow(
        'macOS screen recording permission is denied. Enable Livepair in System Settings > Privacy & Security > Screen Recording, then restart the app.',
      );
      expect(getScreenCaptureAccessStatus).toHaveBeenCalledTimes(1);
      expect(obs.onError).toHaveBeenCalledWith(
        'macOS screen recording permission is denied. Enable Livepair in System Settings > Privacy & Security > Screen Recording, then restart the app.',
      );
    });

    it('throws and calls onError for generic getDisplayMedia error', async () => {
      const { capture, obs } = createHarness({
        getDisplayMediaImpl: () => Promise.reject(new Error('Some other error')),
      });

      await expect(capture.start({})).rejects.toThrow('Some other error');
      expect(obs.onError).toHaveBeenCalledWith('Some other error');
    });

    it('maps the Electron "Not supported" error to a diagnosable message', async () => {
      const { capture, obs } = createHarness({
        getDisplayMediaImpl: () => Promise.reject(new Error('Not supported')),
      });

      await expect(capture.start({})).rejects.toThrow(
        'Screen capture is unavailable because the Electron display-media handler is not active in this build.',
      );
      expect(obs.onError).toHaveBeenCalledWith(
        'Screen capture is unavailable because the Electron display-media handler is not active in this build.',
      );
    });

    it('throws and calls onError when video.play() rejects', async () => {
      const { capture, obs, video } = createHarness();
      video.play.mockRejectedValueOnce(new Error('play failed'));

      await expect(capture.start({})).rejects.toThrow('Screen capture video playback failed');
      expect(obs.onError).toHaveBeenCalledWith('Screen capture video playback failed');
    });

    it('rejects if already capturing', async () => {
      const { capture } = createHarness();
      await capture.start({});
      await expect(capture.start({})).rejects.toThrow('Screen capture is already active');
    });

    it('treats startup as active until a pending stop finishes', async () => {
      let resolveDisplayMedia!: (stream: MediaStream) => void;
      let displayMediaCallCount = 0;
      const track = createTrack();
      const fakeStream = {
        getTracks: () => [track as unknown as MediaStreamTrack],
      } as unknown as MediaStream;
      const { capture, video } = createHarness({
        getDisplayMediaImpl: () =>
          new Promise<MediaStream>((resolve) => {
            if (displayMediaCallCount === 0) {
              resolveDisplayMedia = resolve;
            } else {
              resolve(fakeStream);
            }
            displayMediaCallCount += 1;
          }),
      });

      const startPromise = capture.start({});
      const stopPromise = capture.stop();
      resolveDisplayMedia(fakeStream);

      await Promise.all([startPromise, stopPromise]);

      expect(track.stop).toHaveBeenCalledOnce();
      expect(video.play).not.toHaveBeenCalled();
      await expect(capture.start({})).resolves.toBeUndefined();
    });

    it('caps frameRateHz to 2', async () => {
      const { capture, obs, createInterval } = createHarness();
      await capture.start({ frameRateHz: 10 });
      expect(obs.onDiagnostics).toHaveBeenCalledWith(
        expect.objectContaining({ frameRateHz: 2 }),
      );
      expect(createInterval).toHaveBeenCalledWith(expect.any(Function), 500);
    });

    it('defaults frame cadence to one frame per second', async () => {
      const { capture, createInterval } = createHarness();

      await capture.start({});

      expect(createInterval).toHaveBeenCalledWith(expect.any(Function), 1000);
    });

    it('clamps invalid frameRateHz values to the default cadence', async () => {
      const { capture, obs, createInterval } = createHarness();

      await capture.start({ frameRateHz: 0 });

      expect(obs.onDiagnostics).toHaveBeenCalledWith(
        expect.objectContaining({ frameRateHz: 1 }),
      );
      expect(createInterval).toHaveBeenCalledWith(expect.any(Function), 1000);
    });
  });

  describe('frame emission', () => {
    it('emits binary jpeg bytes from canvas blobs instead of reconstructing bytes from data urls', async () => {
      const jpegBytes = createValidJpegBytes();
      const { capture, obs, tickInterval, canvas } = createHarness({
        blobBytes: jpegBytes,
        toDataUrlResult: btoa('not-a-real-jpeg'),
      });

      await capture.start({});
      await tickInterval();

      expect(canvas.toBlob).toHaveBeenCalledWith(
        expect.any(Function),
        SCREEN_CAPTURE_VIDEO_MIME_TYPE,
        SCREEN_CAPTURE_JPEG_QUALITY,
      );
      expect(canvas.toDataURL).not.toHaveBeenCalled();
      expect(obs.onFrame).toHaveBeenCalledWith(
        expect.objectContaining({
          mimeType: SCREEN_CAPTURE_VIDEO_MIME_TYPE,
          data: jpegBytes,
        }),
      );
      expect(obs.onFrame.mock.calls[0]?.[0].data.slice(0, 2)).toEqual(new Uint8Array([0xff, 0xd8]));
      expect(obs.onFrame.mock.calls[0]?.[0].data.slice(-2)).toEqual(new Uint8Array([0xff, 0xd9]));
    });

    it('emits onFrame on each interval tick', async () => {
      const { capture, obs, tickInterval } = createHarness();
      await capture.start({});
      await tickInterval();
      expect(obs.onFrame).toHaveBeenCalledOnce();
      expect(obs.onFrame).toHaveBeenCalledWith(
        expect.objectContaining({
          mimeType: SCREEN_CAPTURE_VIDEO_MIME_TYPE,
          sequence: 1,
        }),
      );
    });


    it('attaches a lightweight thumbnail analysis payload to each frame', async () => {
      const { capture, obs, tickInterval, analysisCtx2d } = createHarness({
        videoWidth: 1920,
        videoHeight: 1080,
      });
      await capture.start({});
      await tickInterval();

      const frame = obs.onFrame.mock.calls[0]?.[0];
      expect(frame.analysis.widthPx).toBeLessThanOrEqual(160);
      expect(frame.analysis.heightPx).toBeLessThanOrEqual(90);
      expect(frame.analysis.tileLuminance).toHaveLength(40);
      expect(frame.analysis.tileEdge).toHaveLength(40);
      expect(typeof frame.analysis.perceptualHash).toBe('bigint');
      expect(analysisCtx2d.drawImage).toHaveBeenCalledOnce();
      expect(analysisCtx2d.getImageData).toHaveBeenCalledOnce();
    });

    it('increments sequence on each frame', async () => {
      const { capture, obs, tickInterval } = createHarness();
      await capture.start({});
      await tickInterval();
      await tickInterval();
      expect(obs.onFrame).toHaveBeenCalledTimes(2);
      expect(obs.onFrame.mock.calls[0]?.[0]).toMatchObject({ sequence: 1 });
      expect(obs.onFrame.mock.calls[1]?.[0]).toMatchObject({ sequence: 2 });
    });

    it('emits onDiagnostics with frame count on each frame', async () => {
      const { capture, obs, tickInterval } = createHarness();
      await capture.start({});
      const initialCallCount = obs.onDiagnostics.mock.calls.length;
      await tickInterval();
      expect(obs.onDiagnostics).toHaveBeenCalledTimes(initialCallCount + 1);
      expect(obs.onDiagnostics).toHaveBeenLastCalledWith(
        expect.objectContaining({
          frameCount: 1,
          lastFrameAt: expect.any(String),
        }),
      );
    });

    it('skips frame when video dimensions are zero', async () => {
      const { capture, obs, tickInterval } = createHarness({ videoWidth: 0, videoHeight: 0 });
      await capture.start({});
      await tickInterval();
      expect(obs.onFrame).not.toHaveBeenCalled();
    });

    it('caps canvas width to maxWidthPx', async () => {
      const { capture, canvas, tickInterval } = createHarness({ videoWidth: 1920, videoHeight: 1080 });
      await capture.start({ maxWidthPx: 640 });
      await tickInterval();
      expect(canvas.width).toBeLessThanOrEqual(640);
    });

    it('masks matching overlay exclusion rects after drawing and before encoding', async () => {
      const { capture, canvas, ctx2d, tickInterval } = createHarness({
        videoWidth: 200,
        videoHeight: 100,
        trackWidth: 200,
        trackHeight: 100,
        maskingContext: {
          exclusionRects: [{ x: 10, y: 20, width: 30, height: 40 }],
          overlayVisibility: 'panel-open',
          overlayDisplay: {
            displayId: 'display-1',
            bounds: { x: 0, y: 0, width: 200, height: 100 },
            workArea: { x: 0, y: 0, width: 200, height: 100 },
            scaleFactor: 1,
          },
          selectedSource: {
            id: 'screen-1',
            name: 'Entire screen',
            kind: 'screen',
            displayId: 'display-1',
          },
        },
      });

      await capture.start({});
      await tickInterval();

      const drawImageOrder = ctx2d.drawImage.mock.invocationCallOrder[0];
      const fillRectOrder = ctx2d.fillRect.mock.invocationCallOrder[0];
      const toBlobOrder = canvas.toBlob.mock.invocationCallOrder[0];

      if (drawImageOrder === undefined || fillRectOrder === undefined || toBlobOrder === undefined) {
        throw new Error('Expected draw, mask, and encode calls to occur');
      }

      expect(ctx2d.fillRect).toHaveBeenCalledWith(10, 20, 30, 40);
      expect(ctx2d.fillStyle).toBe('#000');
      expect(drawImageOrder).toBeLessThan(fillRectOrder);
      expect(fillRectOrder).toBeLessThan(toBlobOrder);
    });

    it('publishes masking diagnostics from the same decision path and preserves lastMaskedFrameAt on skipped frames', async () => {
      const maskingContext: CaptureExclusionMaskingContext = {
        exclusionRects: [{ x: 10, y: 20, width: 30, height: 40 }],
        overlayVisibility: 'panel-open',
        overlayDisplay: {
          displayId: 'display-1',
          bounds: { x: 0, y: 0, width: 200, height: 100 },
          workArea: { x: 0, y: 0, width: 200, height: 100 },
          scaleFactor: 1,
        },
        selectedSource: {
          id: 'screen-1',
          name: 'Entire screen',
          kind: 'screen',
          displayId: 'display-1',
        },
      };
      const { capture, obs, tickInterval } = createHarness({
        videoWidth: 200,
        videoHeight: 100,
        trackWidth: 200,
        trackHeight: 100,
        maskingContext,
      });

      await capture.start({});
      await tickInterval();

      expect(obs.onDiagnostics).toHaveBeenLastCalledWith(
        expect.objectContaining({
          overlayMaskActive: true,
          maskedRectCount: 1,
          maskReason: 'panel-open',
          lastMaskedFrameAt: expect.any(String),
        }),
      );

      const firstMaskedFrameAt = obs.onDiagnostics.mock.lastCall?.[0].lastMaskedFrameAt;
      if (typeof firstMaskedFrameAt !== 'string') {
        throw new Error('Expected first masked frame timestamp');
      }

      maskingContext.selectedSource = {
        id: 'window-1',
        name: 'Livepair',
        kind: 'window',
      };

      await tickInterval();

      expect(obs.onDiagnostics).toHaveBeenLastCalledWith(
        expect.objectContaining({
          overlayMaskActive: false,
          maskedRectCount: 0,
          maskReason: 'window-source',
        }),
      );
      expect(obs.onDiagnostics.mock.lastCall?.[0].lastMaskedFrameAt).toBeNull();
      const diagnosticCallsWithMaskedTimestamp = obs.onDiagnostics.mock.calls.filter(
        ([diagnostics]) => diagnostics.lastMaskedFrameAt === firstMaskedFrameAt,
      );
      expect(diagnosticCallsWithMaskedTimestamp).toHaveLength(1);
    });

    it('keeps diagnostics aligned as the panel opens and closes during streaming', async () => {
      const maskingContext: CaptureExclusionMaskingContext = {
        exclusionRects: [{ x: 5, y: 10, width: 20, height: 20 }],
        overlayVisibility: 'panel-closed-dock-only',
        overlayDisplay: {
          displayId: 'display-1',
          bounds: { x: 0, y: 0, width: 200, height: 100 },
          workArea: { x: 0, y: 0, width: 200, height: 100 },
          scaleFactor: 1,
        },
        selectedSource: {
          id: 'screen-1',
          name: 'Entire screen',
          kind: 'screen',
          displayId: 'display-1',
        },
      };
      const { capture, obs, tickInterval } = createHarness({
        videoWidth: 200,
        videoHeight: 100,
        trackWidth: 200,
        trackHeight: 100,
        maskingContext,
      });

      await capture.start({});
      await tickInterval();
      expect(obs.onDiagnostics).toHaveBeenLastCalledWith(
        expect.objectContaining({
          overlayMaskActive: true,
          maskedRectCount: 1,
          maskReason: 'panel-closed-dock-only',
        }),
      );

      maskingContext.overlayVisibility = 'panel-open';
      maskingContext.exclusionRects = [
        { x: 5, y: 10, width: 20, height: 20 },
        { x: 50, y: 0, width: 40, height: 100 },
      ];

      await tickInterval();
      expect(obs.onDiagnostics).toHaveBeenLastCalledWith(
        expect.objectContaining({
          overlayMaskActive: true,
          maskedRectCount: 2,
          maskReason: 'panel-open',
        }),
      );

      maskingContext.overlayVisibility = 'panel-closed-dock-only';
      maskingContext.exclusionRects = [{ x: 5, y: 10, width: 20, height: 20 }];

      await tickInterval();
      expect(obs.onDiagnostics).toHaveBeenLastCalledWith(
        expect.objectContaining({
          overlayMaskActive: true,
          maskedRectCount: 1,
          maskReason: 'panel-closed-dock-only',
        }),
      );
    });

    it('clears stale lastMaskedFrameAt when source switching disables masking and restores it when matching resumes', async () => {
      const maskingContext: CaptureExclusionMaskingContext = {
        exclusionRects: [{ x: 10, y: 20, width: 30, height: 40 }],
        overlayVisibility: 'panel-open',
        overlayDisplay: {
          displayId: 'display-1',
          bounds: { x: 0, y: 0, width: 200, height: 100 },
          workArea: { x: 0, y: 0, width: 200, height: 100 },
          scaleFactor: 1,
        },
        selectedSource: {
          id: 'screen-1',
          name: 'Entire screen',
          kind: 'screen',
          displayId: 'display-1',
        },
      };
      const { capture, obs, tickInterval } = createHarness({
        videoWidth: 200,
        videoHeight: 100,
        trackWidth: 200,
        trackHeight: 100,
        maskingContext,
      });

      await capture.start({});
      await tickInterval();

      const firstMaskedFrameAt = obs.onDiagnostics.mock.lastCall?.[0].lastMaskedFrameAt;
      if (typeof firstMaskedFrameAt !== 'string') {
        throw new Error('Expected first masked frame timestamp');
      }

      maskingContext.selectedSource = {
        id: 'window-1',
        name: 'Livepair',
        kind: 'window',
      };
      await tickInterval();
      expect(obs.onDiagnostics).toHaveBeenLastCalledWith(
        expect.objectContaining({
          overlayMaskActive: false,
          maskedRectCount: 0,
          maskReason: 'window-source',
          lastMaskedFrameAt: null,
        }),
      );

      maskingContext.selectedSource = {
        id: 'screen-2',
        name: 'Other display',
        kind: 'screen',
        displayId: 'display-2',
      };
      await tickInterval();
      expect(obs.onDiagnostics).toHaveBeenLastCalledWith(
        expect.objectContaining({
          overlayMaskActive: false,
          maskedRectCount: 0,
          maskReason: 'other-display',
          lastMaskedFrameAt: null,
        }),
      );

      maskingContext.selectedSource = {
        id: 'screen-1',
        name: 'Entire screen',
        kind: 'screen',
        displayId: 'display-1',
      };
      await tickInterval();

      expect(obs.onDiagnostics).toHaveBeenLastCalledWith(
        expect.objectContaining({
          overlayMaskActive: true,
          maskedRectCount: 1,
          maskReason: 'panel-open',
          lastMaskedFrameAt: expect.any(String),
        }),
      );
      const diagnosticCallsWithMaskedTimestamp = obs.onDiagnostics.mock.calls.filter(
        ([diagnostics]) => typeof diagnostics.lastMaskedFrameAt === 'string',
      );
      expect(diagnosticCallsWithMaskedTimestamp).toHaveLength(2);
    });
  });

  describe('wave 4: local frame sizing and quality', () => {
    it('uses track getSettings() width as the basis for sizing, not a fixed monitor assumption', async () => {
      // Track reports 2560×1440 (e.g. a 2K display)
      const { capture, canvas, track, tickInterval } = createHarness({
        trackWidth: 2560,
        trackHeight: 1440,
        videoWidth: 2560,
        videoHeight: 1440,
      });
      await capture.start({});
      await tickInterval();
      expect(track.getSettings).toHaveBeenCalled();
      // Width must be derived from the track's reported 2560, capped at 1920
      expect(canvas.width).toBe(1920);
    });

    it('caps local frame width at 1920px (not the old 640px cap)', async () => {
      const { capture, canvas, tickInterval } = createHarness({
        trackWidth: 1920,
        trackHeight: 1080,
        videoWidth: 1920,
        videoHeight: 1080,
      });
      await capture.start({});
      await tickInterval();
      expect(canvas.width).toBe(1920);
      expect(canvas.width).toBeGreaterThan(640);
    });

    it('preserves aspect ratio when capping to 1920px', async () => {
      // 2560×1600 → should cap at 1920, height = round(1600/2560 * 1920) = 1200
      const { capture, canvas, tickInterval } = createHarness({
        trackWidth: 2560,
        trackHeight: 1600,
        videoWidth: 2560,
        videoHeight: 1600,
      });
      await capture.start({});
      await tickInterval();
      expect(canvas.width).toBe(1920);
      expect(canvas.height).toBe(1200);
    });

    it('preserves aspect ratio for 16:9 source capped at 1920px', async () => {
      // 3840×2160 (4K) → cap at 1920, height = round(2160/3840 * 1920) = 1080
      const { capture, canvas, tickInterval } = createHarness({
        trackWidth: 3840,
        trackHeight: 2160,
        videoWidth: 3840,
        videoHeight: 2160,
      });
      await capture.start({});
      await tickInterval();
      expect(canvas.width).toBe(1920);
      expect(canvas.height).toBe(1080);
    });

    it('does not upscale sources narrower than 1920px', async () => {
      // 1280×720 source — must stay at 1280, not be stretched to 1920
      const { capture, canvas, tickInterval } = createHarness({
        trackWidth: 1280,
        trackHeight: 720,
        videoWidth: 1280,
        videoHeight: 720,
      });
      await capture.start({});
      await tickInterval();
      expect(canvas.width).toBe(1280);
      expect(canvas.height).toBe(720);
    });

    it('does not upscale a 1366×768 source', async () => {
      const { capture, canvas, tickInterval } = createHarness({
        trackWidth: 1366,
        trackHeight: 768,
        videoWidth: 1366,
        videoHeight: 768,
      });
      await capture.start({});
      await tickInterval();
      expect(canvas.width).toBe(1366);
      expect(canvas.height).toBe(768);
    });

    it('encodes frames at JPEG quality 0.92', async () => {
      const { capture, canvas, tickInterval } = createHarness();
      await capture.start({});
      await tickInterval();
      expect(canvas.toBlob).toHaveBeenCalledWith(
        expect.any(Function),
        SCREEN_CAPTURE_VIDEO_MIME_TYPE,
        0.92,
      );
    });
  });

  describe('stop()', () => {
    it('stops the video track on stop()', async () => {
      const { capture, track } = createHarness();
      await capture.start({});
      await capture.stop();
      expect(track.stop).toHaveBeenCalledOnce();
    });

    it('removes the track ended listener on stop()', async () => {
      const { capture, track } = createHarness();
      await capture.start({});
      await capture.stop();
      expect(track.removeEventListener).toHaveBeenCalledWith('ended', expect.any(Function));
    });

    it('does not emit frames after stop()', async () => {
      const { capture, obs, tickInterval } = createHarness();
      await capture.start({});
      await capture.stop();
      await tickInterval();
      expect(obs.onFrame).not.toHaveBeenCalled();
    });

    it('releases the video element and canvas on stop()', async () => {
      const { capture, video, canvas } = createHarness();

      await capture.start({});
      canvas.width = 640;
      canvas.height = 360;
      await capture.stop();

      expect(video.pause).toHaveBeenCalledOnce();
      expect(video.srcObject).toBeNull();
      expect(canvas.width).toBe(0);
      expect(canvas.height).toBe(0);
    });

    it('is a no-op if not capturing', async () => {
      const { capture } = createHarness();
      await expect(capture.stop()).resolves.toBeUndefined();
    });

    it('resets sequence counter after stop/restart', async () => {
      const { capture, obs, tickInterval } = createHarness();
      await capture.start({});
      await tickInterval();
      await capture.stop();
      await capture.start({});
      await tickInterval();
      expect(obs.onFrame).toHaveBeenLastCalledWith(
        expect.objectContaining({ sequence: 1 }),
      );
    });
  });

  describe('track ended event', () => {
    it('calls onError when track ends unexpectedly', async () => {
      const { capture, track, obs } = createHarness();
      await capture.start({});

      const [, endedListener] = track.addEventListener.mock.calls.find(
        (call) => call[0] === 'ended',
      ) ?? [];
      (endedListener as () => void)();

      expect(obs.onError).toHaveBeenCalledWith('Screen capture source ended unexpectedly');
    });

    it('does not call onError for track ended after stop()', async () => {
      const { capture, track, obs } = createHarness();
      await capture.start({});

      const [, endedListener] = track.addEventListener.mock.calls.find(
        (call) => call[0] === 'ended',
      ) ?? [];

      await capture.stop();
      (endedListener as () => void)();

      expect(obs.onError).not.toHaveBeenCalled();
    });
  });

  describe('constants', () => {
    it('exports expected default frame rate', () => {
      expect(SCREEN_CAPTURE_FRAME_RATE_HZ).toBe(1);
    });

    it('exports expected JPEG quality', () => {
      expect(SCREEN_CAPTURE_JPEG_QUALITY).toBe(0.92);
    });

    it('exports expected MIME type', () => {
      expect(SCREEN_CAPTURE_VIDEO_MIME_TYPE).toBe('image/jpeg');
    });
  });
});
