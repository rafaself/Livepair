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

type TrackLike = {
  stop: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};

type CanvasMock = {
  width: number;
  height: number;
  getContext: ReturnType<typeof vi.fn>;
  toDataURL: ReturnType<typeof vi.fn>;
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

function createTrack(): TrackLike {
  return {
    stop: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

function makeBase64Jpeg(): string {
  // minimal valid base64 (fake JPEG bytes)
  return btoa('fake-jpeg-data');
}

function createHarness(opts: {
  getDisplayMediaImpl?: () => Promise<MediaStream>;
  videoWidth?: number;
  videoHeight?: number;
  toDataUrlResult?: string;
} = {}): {
  capture: ReturnType<typeof createLocalScreenCapture>;
  obs: ReturnType<typeof createObserver>;
  deps: CreateLocalScreenCaptureDependencies;
  track: TrackLike;
  canvas: CanvasMock;
  video: VideoMock;
  tickInterval: () => void;
  getDisplayMedia: ReturnType<typeof vi.fn>;
} {
  const obs = createObserver();
  const track = createTrack();

  const fakeStream = {
    getTracks: () => [track as unknown as MediaStreamTrack],
  } as unknown as MediaStream;

  const getDisplayMedia = vi.fn(
    opts.getDisplayMediaImpl ?? (() => Promise.resolve(fakeStream)),
  );

  let intervalCallback: (() => void) | null = null;
  const createInterval = vi.fn((cb: () => void, _ms: number) => {
    intervalCallback = cb;
    return vi.fn(() => {
      intervalCallback = null;
    });
  });

  const ctx2d = {
    drawImage: vi.fn(),
  };

  const canvas: CanvasMock = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx2d),
    toDataURL: vi.fn(() => `data:image/jpeg;base64,${opts.toDataUrlResult ?? makeBase64Jpeg()}`),
  };

  const video: VideoMock = {
    srcObject: null,
    videoWidth: opts.videoWidth ?? 1280,
    videoHeight: opts.videoHeight ?? 720,
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
  };

  const deps: CreateLocalScreenCaptureDependencies = {
    getDisplayMedia: getDisplayMedia as unknown as () => Promise<MediaStream>,
    createCanvas: () => canvas as unknown as ReturnType<NonNullable<CreateLocalScreenCaptureDependencies['createCanvas']>>,
    createVideoElement: () => video as unknown as ReturnType<NonNullable<CreateLocalScreenCaptureDependencies['createVideoElement']>>,
    createInterval: createInterval as unknown as CreateLocalScreenCaptureDependencies['createInterval'],
  };

  const capture = createLocalScreenCapture(obs.observer, deps);

  return {
    capture,
    obs,
    deps,
    track,
    canvas,
    video,
    tickInterval: () => {
      intervalCallback?.();
    },
    getDisplayMedia,
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
        expect.objectContaining({ frameRateHz: 1, frameCount: 0, lastError: null }),
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

    it('throws and calls onError for generic getDisplayMedia error', async () => {
      const { capture, obs } = createHarness({
        getDisplayMediaImpl: () => Promise.reject(new Error('Some other error')),
      });

      await expect(capture.start({})).rejects.toThrow('Some other error');
      expect(obs.onError).toHaveBeenCalledWith('Some other error');
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

    it('caps frameRateHz to 2', async () => {
      const { capture, obs } = createHarness();
      await capture.start({ frameRateHz: 10 });
      expect(obs.onDiagnostics).toHaveBeenCalledWith(
        expect.objectContaining({ frameRateHz: 2 }),
      );
    });
  });

  describe('frame emission', () => {
    it('emits onFrame on each interval tick', async () => {
      const { capture, obs, tickInterval } = createHarness();
      await capture.start({});
      tickInterval();
      expect(obs.onFrame).toHaveBeenCalledOnce();
      expect(obs.onFrame).toHaveBeenCalledWith(
        expect.objectContaining({
          mimeType: SCREEN_CAPTURE_VIDEO_MIME_TYPE,
          sequence: 1,
        }),
      );
    });

    it('increments sequence on each frame', async () => {
      const { capture, obs, tickInterval } = createHarness();
      await capture.start({});
      tickInterval();
      tickInterval();
      expect(obs.onFrame).toHaveBeenCalledTimes(2);
      expect(obs.onFrame.mock.calls[0][0]).toMatchObject({ sequence: 1 });
      expect(obs.onFrame.mock.calls[1][0]).toMatchObject({ sequence: 2 });
    });

    it('emits onDiagnostics with frame count on each frame', async () => {
      const { capture, obs, tickInterval } = createHarness();
      await capture.start({});
      const initialCallCount = obs.onDiagnostics.mock.calls.length;
      tickInterval();
      expect(obs.onDiagnostics).toHaveBeenCalledTimes(initialCallCount + 1);
      expect(obs.onDiagnostics).toHaveBeenLastCalledWith(
        expect.objectContaining({ frameCount: 1 }),
      );
    });

    it('skips frame when video dimensions are zero', async () => {
      const { capture, obs, tickInterval } = createHarness({ videoWidth: 0, videoHeight: 0 });
      await capture.start({});
      tickInterval();
      expect(obs.onFrame).not.toHaveBeenCalled();
    });

    it('caps canvas width to maxWidthPx', async () => {
      const { capture, canvas, tickInterval } = createHarness({ videoWidth: 1920, videoHeight: 1080 });
      await capture.start({ maxWidthPx: 640 });
      tickInterval();
      expect(canvas.width).toBeLessThanOrEqual(640);
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
      tickInterval();
      expect(obs.onFrame).not.toHaveBeenCalled();
    });

    it('is a no-op if not capturing', async () => {
      const { capture } = createHarness();
      await expect(capture.stop()).resolves.toBeUndefined();
    });

    it('resets sequence counter after stop/restart', async () => {
      const { capture, obs, tickInterval } = createHarness();
      await capture.start({});
      tickInterval();
      await capture.stop();
      await capture.start({});
      tickInterval();
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
        ([type]: [string]) => type === 'ended',
      ) ?? [];
      (endedListener as () => void)();

      expect(obs.onError).toHaveBeenCalledWith('Screen capture source ended unexpectedly');
    });

    it('does not call onError for track ended after stop()', async () => {
      const { capture, track, obs } = createHarness();
      await capture.start({});

      const [, endedListener] = track.addEventListener.mock.calls.find(
        ([type]: [string]) => type === 'ended',
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
      expect(SCREEN_CAPTURE_JPEG_QUALITY).toBe(0.7);
    });

    it('exports expected MIME type', () => {
      expect(SCREEN_CAPTURE_VIDEO_MIME_TYPE).toBe('image/jpeg');
    });
  });
});
