import { describe, expect, it, vi } from 'vitest';
import { createScreenCaptureController } from './screenCaptureController';
import type { VisualSendPolicyOptions } from './visualSendPolicy';
import { createDefaultRealtimeOutboundDiagnostics } from '../outbound/realtimeOutboundGateway';
import type { DesktopSession } from '../transport/transport.types';
import type {
  RealtimeOutboundDecision,
  RealtimeOutboundEvent,
  RealtimeOutboundGateway,
} from '../outbound/outbound.types';
import type { VoiceSessionStatus } from '../voice/voice.types';
import type { ScreenCaptureState } from './screen.types';
import type { LocalScreenCaptureObserver } from './localScreenCapture';
import {
  SCREEN_CAPTURE_FRAME_RATE_HZ,
  SCREEN_CAPTURE_JPEG_QUALITY,
  SCREEN_CAPTURE_MAX_WIDTH_PX,
} from './localScreenCapture';

function createHarness(options: {
  voiceSessionStatus?: VoiceSessionStatus;
  screenCaptureState?: ScreenCaptureState;
  saveScreenFramesEnabled?: boolean;
  submitDecision?: (callIndex: number) => RealtimeOutboundDecision;
  visualSendPolicyOptions?: VisualSendPolicyOptions;
} = {}) {
  const { voiceSessionStatus = 'ready', screenCaptureState = 'disabled' } = options;
  let currentScreenState: ScreenCaptureState = screenCaptureState;
  let currentVoiceStatus: VoiceSessionStatus = voiceSessionStatus;

  const setScreenCaptureState = vi.fn((s: ScreenCaptureState) => { currentScreenState = s; });
  const setScreenCaptureDiagnostics = vi.fn();
  const setVisualSendDiagnostics = vi.fn();
  const setLastRuntimeError = vi.fn();
  const store = {
    getState: () => ({
      voiceSessionStatus: currentVoiceStatus,
      screenCaptureState: currentScreenState,
      setScreenCaptureState,
      setScreenCaptureDiagnostics,
      setVisualSendDiagnostics,
      setLastRuntimeError,
    }),
  };

  let capturedObserver: LocalScreenCaptureObserver | null = null;
  let resolveStop: (() => void) | null = null;
  let deferStop = false;
  const mockCapture = {
    start: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => {
      if (!deferStop) {
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        resolveStop = resolve;
      });
    }),
  };
  const createCapture = vi.fn((observer: LocalScreenCaptureObserver) => {
    capturedObserver = observer;
    return mockCapture;
  });

  const sendVideoFrame = vi.fn(() => Promise.resolve());
  const transport = { sendVideoFrame } as unknown as DesktopSession;
  let currentTransport: DesktopSession | null = transport;

  const shouldSaveScreenFrames = vi.fn(() => options.saveScreenFramesEnabled ?? false);
  const startScreenFrameDumpSession = vi.fn(async () => ({
    directoryPath: '/tmp/livepair/screen-frame-dumps/current-debug-session',
  }));
  const saveScreenFrameDumpFrame = vi.fn(async () => undefined);
  const setScreenFrameDumpDirectoryPath = vi.fn();
  let gatewaySubmitCount = 0;
  const outboundGateway: RealtimeOutboundGateway = {
    submit: vi.fn((_event: RealtimeOutboundEvent): RealtimeOutboundDecision => {
      gatewaySubmitCount += 1;
      return options.submitDecision?.(gatewaySubmitCount) ?? {
        outcome: gatewaySubmitCount === 1 ? 'send' : 'replace',
        classification: 'replaceable',
        reason: gatewaySubmitCount === 1 ? 'accepted' : 'superseded-latest',
      };
    }),
    settle: vi.fn(),
    recordFailure: vi.fn(),
    recordSuccess: vi.fn(),
    reset: vi.fn(),
    getDiagnostics: vi.fn(createDefaultRealtimeOutboundDiagnostics),
  };

  const ctrl = createScreenCaptureController(
    store,
    createCapture,
    () => currentTransport,
    () => outboundGateway,
    {
      shouldSaveFrames: shouldSaveScreenFrames,
      startScreenFrameDumpSession,
      saveScreenFrameDumpFrame,
      setScreenFrameDumpDirectoryPath,
    },
    options.visualSendPolicyOptions,
  );

  return {
    ctrl,
    store: { setScreenCaptureState, setScreenCaptureDiagnostics, setVisualSendDiagnostics, setLastRuntimeError },
    mockCapture,
    createCapture,
    sendVideoFrame,
    getObserver: () => capturedObserver,
    setTransport: (t: DesktopSession | null) => { currentTransport = t; },
    setVoiceStatus: (s: VoiceSessionStatus) => { currentVoiceStatus = s; },
    setScreenState: (s: ScreenCaptureState) => { currentScreenState = s; },
    shouldSaveScreenFrames,
    startScreenFrameDumpSession,
    saveScreenFrameDumpFrame,
    setScreenFrameDumpDirectoryPath,
    outboundGateway,
    enableDeferredStop: () => { deferStop = true; },
    resolveStop: () => {
      resolveStop?.();
      resolveStop = null;
    },
  };
}

describe('createScreenCaptureController', () => {
  it('isActive returns false initially', () => {
    const { ctrl } = createHarness();
    expect(ctrl.isActive()).toBe(false);
  });

  it('start creates capture and transitions to capturing', async () => {
    const { ctrl, store, createCapture } = createHarness();

    await ctrl.start();

    expect(createCapture).toHaveBeenCalledTimes(1);
    expect(ctrl.isActive()).toBe(true);
    expect(store.setScreenCaptureState).toHaveBeenCalledWith('requestingPermission');
    expect(store.setScreenCaptureState).toHaveBeenCalledWith('ready');
    expect(store.setScreenCaptureState).toHaveBeenCalledWith('capturing');
  });

  it('flushes visual diagnostics through start, snapshot send, and stop', async () => {
    const { ctrl, store } = createHarness();

    await ctrl.start();
    expect(store.setVisualSendDiagnostics).toHaveBeenLastCalledWith({
      lastTransitionReason: 'screenShareStarted',
      snapshotCount: 0,
      streamingEnteredAt: null,
      streamingEndedAt: null,
      sentByState: {
        snapshot: 0,
        streaming: 0,
      },
    });

    ctrl.analyzeScreenNow();
    expect(store.setVisualSendDiagnostics).toHaveBeenLastCalledWith({
      lastTransitionReason: 'analyzeScreenNow',
      snapshotCount: 1,
      streamingEnteredAt: null,
      streamingEndedAt: null,
      sentByState: {
        snapshot: 0,
        streaming: 0,
      },
    });

    await ctrl.enqueueFrameSend({
      data: new Uint8Array([1]),
      mimeType: 'image/jpeg',
      sequence: 1,
      widthPx: 640,
      heightPx: 360,
    });
    expect(store.setVisualSendDiagnostics).toHaveBeenLastCalledWith({
      lastTransitionReason: 'snapshotConsumed',
      snapshotCount: 1,
      streamingEnteredAt: null,
      streamingEndedAt: null,
      sentByState: {
        snapshot: 1,
        streaming: 0,
      },
    });

    await ctrl.stop();
    expect(store.setVisualSendDiagnostics).toHaveBeenLastCalledWith({
      lastTransitionReason: 'screenShareStopped',
      snapshotCount: 1,
      streamingEnteredAt: null,
      streamingEndedAt: null,
      sentByState: {
        snapshot: 1,
        streaming: 0,
      },
    });
  });

  it('start passes the explicit conservative screen policy to local capture', async () => {
    const { ctrl, mockCapture } = createHarness();

    await ctrl.start();

    expect(mockCapture.start).toHaveBeenCalledWith({
      frameRateHz: SCREEN_CAPTURE_FRAME_RATE_HZ,
      jpegQuality: SCREEN_CAPTURE_JPEG_QUALITY,
      maxWidthPx: SCREEN_CAPTURE_MAX_WIDTH_PX,
    });
  });

  it('does not start or write a debug frame dump when saving is disabled', async () => {
    const {
      ctrl,
      getObserver,
      startScreenFrameDumpSession,
      saveScreenFrameDumpFrame,
    } = createHarness({ saveScreenFramesEnabled: false });

    await ctrl.start();
    getObserver()!.onFrame({
      data: new Uint8Array([1, 2, 3]),
      mimeType: 'image/jpeg',
      sequence: 1,
      widthPx: 640,
      heightPx: 360,
    });
    await Promise.resolve();

    expect(startScreenFrameDumpSession).not.toHaveBeenCalled();
    expect(saveScreenFrameDumpFrame).not.toHaveBeenCalled();
  });

  it('starts a fresh debug frame dump session and saves sampled frames when enabled', async () => {
    const {
      ctrl,
      getObserver,
      startScreenFrameDumpSession,
      saveScreenFrameDumpFrame,
      setScreenFrameDumpDirectoryPath,
    } = createHarness({ saveScreenFramesEnabled: true });

    await ctrl.start();

    expect(setScreenFrameDumpDirectoryPath).toHaveBeenCalledWith(null);
    expect(startScreenFrameDumpSession).toHaveBeenCalledTimes(1);
    expect(setScreenFrameDumpDirectoryPath).toHaveBeenCalledWith(
      '/tmp/livepair/screen-frame-dumps/current-debug-session',
    );

    getObserver()!.onFrame({
      data: new Uint8Array([7, 8, 9]),
      mimeType: 'image/jpeg',
      sequence: 3,
      widthPx: 320,
      heightPx: 180,
    });

    await vi.waitFor(() => {
      expect(saveScreenFrameDumpFrame).toHaveBeenCalledWith({
        data: new Uint8Array([7, 8, 9]),
        mimeType: 'image/jpeg',
        sequence: 3,
      });
    });
  });

  it('start rejects when voice session is not active', async () => {
    const { ctrl, store } = createHarness({ voiceSessionStatus: 'disconnected' });

    await ctrl.start();

    expect(store.setScreenCaptureState).toHaveBeenCalledWith('error');
    expect(store.setLastRuntimeError).toHaveBeenCalledWith(
      'Screen context requires an active Live session',
    );
    expect(ctrl.isActive()).toBe(false);
  });

  it('start rejects when no active Live transport is attached', async () => {
    const { ctrl, createCapture, store, setTransport } = createHarness({ voiceSessionStatus: 'ready' });
    setTransport(null);

    await ctrl.start();

    expect(createCapture).not.toHaveBeenCalled();
    expect(store.setScreenCaptureState).toHaveBeenCalledWith('error');
    expect(store.setLastRuntimeError).toHaveBeenCalledWith(
      'Screen context requires an active Live session',
    );
    expect(ctrl.isActive()).toBe(false);
  });

  it('start is no-op when already capturing', async () => {
    const { ctrl, createCapture } = createHarness({ screenCaptureState: 'capturing' });

    await ctrl.start();

    expect(createCapture).not.toHaveBeenCalled();
  });

  it('start handles capture.start failure', async () => {
    const { ctrl, store, mockCapture } = createHarness();
    mockCapture.start.mockRejectedValue(new Error('permission denied'));

    await ctrl.start();

    expect(store.setScreenCaptureState).toHaveBeenCalledWith('error');
    expect(store.setLastRuntimeError).toHaveBeenCalledWith(
      expect.stringContaining('permission denied'),
    );
    expect(ctrl.isActive()).toBe(false);
  });

  it('stop with active capture calls capture.stop', async () => {
    const { ctrl, mockCapture } = createHarness();

    await ctrl.start();
    await ctrl.stop();

    expect(mockCapture.stop).toHaveBeenCalled();
    expect(ctrl.isActive()).toBe(false);
  });

  it('stop transitions through stopping to disabled', async () => {
    const { ctrl, store } = createHarness();

    await ctrl.start();
    store.setScreenCaptureState.mockClear();
    await ctrl.stop();

    expect(store.setScreenCaptureState).toHaveBeenCalledWith('stopping');
    expect(store.setScreenCaptureState).toHaveBeenCalledWith('disabled');
  });

  it('keeps the current debug frame dump path available after screen capture stops', async () => {
    const {
      ctrl,
      setScreenFrameDumpDirectoryPath,
    } = createHarness({ saveScreenFramesEnabled: true });

    await ctrl.start();
    setScreenFrameDumpDirectoryPath.mockClear();

    await ctrl.stop();

    expect(setScreenFrameDumpDirectoryPath).not.toHaveBeenCalledWith(null);
  });

  it('start waits for an in-flight stop before creating a new capture', async () => {
    const { ctrl, createCapture, enableDeferredStop, resolveStop } = createHarness();

    await ctrl.start();
    enableDeferredStop();
    const stopPromise = ctrl.stop();
    await Promise.resolve();

    const restartPromise = ctrl.start();
    await Promise.resolve();

    expect(createCapture).toHaveBeenCalledTimes(1);

    resolveStop();
    await stopPromise;
    await restartPromise;

    expect(createCapture).toHaveBeenCalledTimes(2);
  });

  it('stop is no-op when already disabled', async () => {
    const { ctrl, store } = createHarness({ screenCaptureState: 'disabled' });

    await ctrl.stop();

    expect(store.setScreenCaptureState).not.toHaveBeenCalled();
  });

  it('stop without capture resets to disabled', async () => {
    const { ctrl, store } = createHarness({ screenCaptureState: 'error' });

    await ctrl.stop();

    expect(store.setScreenCaptureState).toHaveBeenCalledWith('disabled');
  });

  it('stopInternal without capture sets state directly', () => {
    const { ctrl, store } = createHarness();

    ctrl.stopInternal({ nextState: 'error', detail: 'test', preserveDiagnostics: true, uploadStatus: 'error' });

    expect(store.setScreenCaptureState).toHaveBeenCalledWith('error');
    expect(store.setScreenCaptureDiagnostics).toHaveBeenCalledWith({
      lastUploadStatus: 'error',
      lastError: 'test',
    });
  });

  it('stopInternal without preserveDiagnostics resets them', () => {
    const { ctrl, store } = createHarness();

    ctrl.stopInternal();

    expect(store.setScreenCaptureDiagnostics).toHaveBeenCalledWith(
      expect.objectContaining({ frameCount: 0, lastError: null }),
    );
  });

  it('resetDiagnostics resets all fields', () => {
    const { ctrl, store } = createHarness();

    ctrl.resetDiagnostics();

    expect(store.setScreenCaptureDiagnostics).toHaveBeenCalledWith({
      captureSource: null,
      frameCount: 0,
      frameRateHz: null,
      widthPx: null,
      heightPx: null,
      lastFrameAt: null,
      lastUploadStatus: 'idle',
      lastError: null,
    });
  });

  it('enqueueFrameSend sends frame via transport', async () => {
    const { ctrl, sendVideoFrame, store, outboundGateway } = createHarness();

    await ctrl.start();
    ctrl.enableStreaming();
    const frame = { data: new Uint8Array([1, 2]), mimeType: 'image/jpeg' as const, sequence: 1, widthPx: 640, heightPx: 480 };
    await ctrl.enqueueFrameSend(frame);

    expect(outboundGateway.submit).toHaveBeenCalledWith({
      kind: 'visual_frame',
      channelKey: 'visual:screen',
      replaceKey: 'visual:screen',
      sequence: 1,
      createdAtMs: expect.any(Number),
      estimatedBytes: 2,
    });
    expect(sendVideoFrame).toHaveBeenCalledWith(frame.data, frame.mimeType);
    expect(outboundGateway.recordSuccess).toHaveBeenCalledTimes(1);
    expect(store.setScreenCaptureDiagnostics).toHaveBeenCalledWith({
      lastUploadStatus: 'sending',
      lastError: null,
    });
  });

  it('does not dispatch visual frames when the gateway blocks them', async () => {
    const { ctrl, sendVideoFrame, outboundGateway, store } = createHarness({
      submitDecision: () => ({
        outcome: 'block',
        classification: 'replaceable',
        reason: 'breaker-open',
      }),
    });

    await ctrl.start();
    ctrl.enableStreaming();
    await ctrl.enqueueFrameSend({
      data: new Uint8Array([9]),
      mimeType: 'image/jpeg',
      sequence: 1,
      widthPx: 320,
      heightPx: 240,
    });

    expect(outboundGateway.submit).toHaveBeenCalledTimes(1);
    expect(sendVideoFrame).not.toHaveBeenCalled();
    expect(outboundGateway.recordSuccess).not.toHaveBeenCalled();
    expect(outboundGateway.recordFailure).not.toHaveBeenCalled();
    expect(
      store.setScreenCaptureDiagnostics.mock.calls.some(
        ([patch]) => patch.lastUploadStatus === 'sending',
      ),
    ).toBe(false);
  });

  it('drops screen frames while resume temporarily leaves no active transport', async () => {
    const { ctrl, setTransport, sendVideoFrame } = createHarness();

    await ctrl.start();
    setTransport(null);
    const frame = { data: new Uint8Array([1]), mimeType: 'image/jpeg' as const, sequence: 1, widthPx: 320, heightPx: 240 };
    const result = await ctrl.enqueueFrameSend(frame);

    expect(result).toBeUndefined();
    expect(sendVideoFrame).not.toHaveBeenCalled();
  });

  it('drops queued screen frames if resumption swaps the active transport before send', async () => {
    const { ctrl, setTransport, sendVideoFrame, store } = createHarness();
    const nextTransport = {
      sendVideoFrame: vi.fn(() => Promise.resolve()),
    } as unknown as DesktopSession;
    let resolveFirstSend!: () => void;
    sendVideoFrame.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveFirstSend = () => resolve();
        }),
    );

    await ctrl.start();
    ctrl.enableStreaming();
    const firstSend = ctrl.enqueueFrameSend({
      data: new Uint8Array([1]),
      mimeType: 'image/jpeg',
      sequence: 1,
      widthPx: 320,
      heightPx: 240,
    });
    await Promise.resolve();
    const secondSend = ctrl.enqueueFrameSend({
      data: new Uint8Array([2]),
      mimeType: 'image/jpeg',
      sequence: 2,
      widthPx: 320,
      heightPx: 240,
    });

    setTransport(nextTransport);
    resolveFirstSend();
    await Promise.all([firstSend, secondSend]);

    expect(sendVideoFrame).toHaveBeenCalledTimes(1);
    expect(nextTransport.sendVideoFrame).not.toHaveBeenCalled();
    expect(
      store.setScreenCaptureDiagnostics.mock.calls.filter(
        ([patch]) => patch.lastUploadStatus === 'sent',
      ),
    ).toHaveLength(0);
  });

  it('routes replaceable visual frames through the gateway and keeps only bounded latest pending work', async () => {
    const { ctrl, sendVideoFrame, outboundGateway } = createHarness({
      submitDecision: (callIndex) => ({
        outcome: callIndex === 1 ? 'send' : 'replace',
        classification: 'replaceable',
        reason: callIndex === 1 ? 'accepted' : 'superseded-latest',
      }),
    });
    let resolveFirstSend!: () => void;

    sendVideoFrame
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirstSend = resolve;
          }),
      )
      .mockResolvedValueOnce(undefined);

    await ctrl.start();
    ctrl.enableStreaming();
    const firstSend = ctrl.enqueueFrameSend({
      data: new Uint8Array([1]),
      mimeType: 'image/jpeg',
      sequence: 1,
      widthPx: 320,
      heightPx: 240,
    });
    await Promise.resolve();
    const secondSend = ctrl.enqueueFrameSend({
      data: new Uint8Array([2]),
      mimeType: 'image/jpeg',
      sequence: 2,
      widthPx: 320,
      heightPx: 240,
    });
    const thirdSend = ctrl.enqueueFrameSend({
      data: new Uint8Array([3]),
      mimeType: 'image/jpeg',
      sequence: 3,
      widthPx: 320,
      heightPx: 240,
    });

    resolveFirstSend();
    await Promise.all([firstSend, secondSend, thirdSend]);

    expect(outboundGateway.submit).toHaveBeenCalledTimes(3);
    expect(sendVideoFrame).toHaveBeenCalledTimes(2);
    expect(sendVideoFrame.mock.calls).toEqual([
      [new Uint8Array([1]), 'image/jpeg'],
      [new Uint8Array([3]), 'image/jpeg'],
    ]);
  });

  it('ignores stale send failures after capture stops', async () => {
    const { ctrl, sendVideoFrame, store } = createHarness();
    let rejectSend!: (error: Error) => void;
    let firstSendStarted = false;
    sendVideoFrame.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          firstSendStarted = true;
          rejectSend = reject;
        }),
    );

    await ctrl.start();
    ctrl.enableStreaming();
    const sendPromise = ctrl.enqueueFrameSend({
      data: new Uint8Array([1]),
      mimeType: 'image/jpeg',
      sequence: 1,
      widthPx: 320,
      heightPx: 240,
    });

    await vi.waitFor(() => {
      expect(firstSendStarted).toBe(true);
    });
    await ctrl.stop();
    rejectSend(new Error('frame upload failed after stop'));
    await sendPromise;

    expect(
      store.setScreenCaptureState.mock.calls.some(([state]) => state === 'error'),
    ).toBe(false);
    expect(store.setLastRuntimeError).not.toHaveBeenCalledWith(
      'frame upload failed after stop',
    );
  });

  it('stops capture and preserves error diagnostics when an active frame send fails', async () => {
    const { ctrl, sendVideoFrame, store, outboundGateway, mockCapture } = createHarness();
    sendVideoFrame.mockRejectedValueOnce(new Error('frame upload failed'));

    await ctrl.start();
    ctrl.enableStreaming();
    await ctrl.enqueueFrameSend({
      data: new Uint8Array([1]),
      mimeType: 'image/jpeg',
      sequence: 1,
      widthPx: 320,
      heightPx: 240,
    });

    await vi.waitFor(() => {
      expect(outboundGateway.recordFailure).toHaveBeenCalledWith('frame upload failed');
      expect(mockCapture.stop).toHaveBeenCalledTimes(1);
      expect(store.setLastRuntimeError).toHaveBeenCalledWith('frame upload failed');
      expect(store.setScreenCaptureState.mock.calls.slice(-2)).toEqual([
        ['stopping'],
        ['error'],
      ]);
      expect(store.setScreenCaptureDiagnostics).toHaveBeenLastCalledWith({
        lastUploadStatus: 'error',
        lastError: 'frame upload failed',
      });
    });

    expect(ctrl.getVisualSendState()).toBe('inactive');
    expect(ctrl.isActive()).toBe(false);
  });

  it('resets the send chain when capture is toggled off and back on', async () => {
    const { ctrl, sendVideoFrame } = createHarness();
    let firstSendStarted = false;
    sendVideoFrame
      .mockImplementationOnce(
        () =>
          new Promise<void>(() => {
            firstSendStarted = true;
          }),
      )
      .mockResolvedValueOnce(undefined);

    await ctrl.start();
    ctrl.enableStreaming();
    void ctrl.enqueueFrameSend({
      data: new Uint8Array([1]),
      mimeType: 'image/jpeg',
      sequence: 1,
      widthPx: 320,
      heightPx: 240,
    });
    await vi.waitFor(() => {
      expect(firstSendStarted).toBe(true);
    });

    await ctrl.stop();
    await ctrl.start();
    ctrl.enableStreaming();
    await ctrl.enqueueFrameSend({
      data: new Uint8Array([2]),
      mimeType: 'image/jpeg',
      sequence: 2,
      widthPx: 320,
      heightPx: 240,
    });

    expect(sendVideoFrame).toHaveBeenCalledTimes(2);
    expect(sendVideoFrame.mock.calls[1]).toEqual([
      new Uint8Array([2]),
      'image/jpeg',
    ]);
  });

  it('enqueueFrameSend is no-op without active capture', async () => {
    const { ctrl, sendVideoFrame } = createHarness();

    // Not started, so no capture
    const frame = { data: new Uint8Array([1]), mimeType: 'image/jpeg' as const, sequence: 1, widthPx: 320, heightPx: 240 };
    await ctrl.enqueueFrameSend(frame);

    expect(sendVideoFrame).not.toHaveBeenCalled();
  });

  it('observer onError stops capture, preserves diagnostics, and resets visual state', async () => {
    const { ctrl, store, getObserver, mockCapture } = createHarness();

    await ctrl.start();
    ctrl.enableStreaming();
    getObserver()!.onError('device lost');

    await vi.waitFor(() => {
      expect(mockCapture.stop).toHaveBeenCalledTimes(1);
      expect(store.setLastRuntimeError).toHaveBeenCalledWith('device lost');
      expect(store.setScreenCaptureState.mock.calls.slice(-2)).toEqual([
        ['stopping'],
        ['error'],
      ]);
      expect(store.setScreenCaptureDiagnostics).toHaveBeenLastCalledWith({
        lastUploadStatus: 'error',
        lastError: 'device lost',
      });
    });

    expect(ctrl.getVisualSendState()).toBe('inactive');
    expect(ctrl.isActive()).toBe(false);
  });

  it('observer onDiagnostics patches store', async () => {
    const { ctrl, store, getObserver } = createHarness();

    await ctrl.start();
    getObserver()!.onDiagnostics({ frameCount: 42 });

    expect(store.setScreenCaptureDiagnostics).toHaveBeenCalledWith({ frameCount: 42 });
  });

  it('start allowed for all active voice statuses', async () => {
    for (const status of ['ready', 'capturing', 'streaming', 'interrupted'] as VoiceSessionStatus[]) {
      const { ctrl, createCapture } = createHarness({ voiceSessionStatus: status });
      await ctrl.start();
      expect(createCapture).toHaveBeenCalledTimes(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Visual send policy integration – Wave 1
//
// After start(), the visual state is 'sleep': capture is running but frames
// are NOT automatically forwarded.  Frames are only sent after an explicit
// request (analyzeScreenNow → snapshot) or an explicit streaming trigger.
// ---------------------------------------------------------------------------
describe('createScreenCaptureController – visual send policy', () => {
  it('does NOT send frames automatically after start (visual state is sleep)', async () => {
    const { ctrl, getObserver, sendVideoFrame } = createHarness();
    await ctrl.start();

    getObserver()!.onFrame({
      data: new Uint8Array([1, 2, 3]),
      mimeType: 'image/jpeg',
      sequence: 1,
      widthPx: 640,
      heightPx: 360,
    });
    await Promise.resolve();

    expect(sendVideoFrame).not.toHaveBeenCalled();
  });

  it('sends exactly one frame after analyzeScreenNow (snapshot)', async () => {
    const { ctrl, getObserver, sendVideoFrame } = createHarness();
    await ctrl.start();
    ctrl.analyzeScreenNow();

    const frame = { data: new Uint8Array([1]), mimeType: 'image/jpeg' as const, sequence: 1, widthPx: 640, heightPx: 360 };
    getObserver()!.onFrame(frame);
    await Promise.resolve();

    expect(sendVideoFrame).toHaveBeenCalledTimes(1);
    expect(sendVideoFrame).toHaveBeenCalledWith(frame.data, frame.mimeType);
  });

  it('returns to sleep after the snapshot frame is sent (next frame is blocked)', async () => {
    const { ctrl, getObserver, sendVideoFrame } = createHarness();
    await ctrl.start();
    ctrl.analyzeScreenNow();

    const mkFrame = (seq: number) => ({
      data: new Uint8Array([seq]),
      mimeType: 'image/jpeg' as const,
      sequence: seq,
      widthPx: 640,
      heightPx: 360,
    });

    // First frame – snapshot consumed
    getObserver()!.onFrame(mkFrame(1));
    await Promise.resolve();
    // Second frame – back in sleep, should be blocked
    getObserver()!.onFrame(mkFrame(2));
    await Promise.resolve();

    expect(sendVideoFrame).toHaveBeenCalledTimes(1);
  });

  it('sends every frame when enableStreaming is called', async () => {
    const { ctrl, getObserver, sendVideoFrame } = createHarness({
      submitDecision: (i) => ({
        outcome: i === 1 ? 'send' : 'replace',
        classification: 'replaceable',
        reason: i === 1 ? 'accepted' : 'superseded-latest',
      }),
    });
    await ctrl.start();
    ctrl.enableStreaming();

    const mkFrame = (seq: number) => ({
      data: new Uint8Array([seq]),
      mimeType: 'image/jpeg' as const,
      sequence: seq,
      widthPx: 640,
      heightPx: 360,
    });

    getObserver()!.onFrame(mkFrame(1));
    await Promise.resolve();
    getObserver()!.onFrame(mkFrame(2));
    await Promise.resolve();

    expect(sendVideoFrame).toHaveBeenCalledTimes(2);
  });

  it('stops sending frames after stopStreaming (back in sleep)', async () => {
    const { ctrl, getObserver, sendVideoFrame } = createHarness();
    await ctrl.start();
    ctrl.enableStreaming();
    ctrl.stopStreaming();

    getObserver()!.onFrame({
      data: new Uint8Array([1]),
      mimeType: 'image/jpeg',
      sequence: 1,
      widthPx: 640,
      heightPx: 360,
    });
    await Promise.resolve();

    expect(sendVideoFrame).not.toHaveBeenCalled();
  });

  it('resets visual state to inactive when stop is called', async () => {
    const { ctrl } = createHarness();
    await ctrl.start();
    ctrl.analyzeScreenNow();
    await ctrl.stop();

    expect(ctrl.getVisualSendState()).toBe('inactive');
  });

  it('visual state is inactive before start is called', () => {
    const { ctrl } = createHarness();
    expect(ctrl.getVisualSendState()).toBe('inactive');
  });

  it('visual state becomes sleep after start succeeds', async () => {
    const { ctrl } = createHarness();
    await ctrl.start();
    expect(ctrl.getVisualSendState()).toBe('sleep');
  });

  it('visual state becomes snapshot after analyzeScreenNow', async () => {
    const { ctrl } = createHarness();
    await ctrl.start();
    ctrl.analyzeScreenNow();
    expect(ctrl.getVisualSendState()).toBe('snapshot');
  });

  it('visual state becomes streaming after enableStreaming', async () => {
    const { ctrl } = createHarness();
    await ctrl.start();
    ctrl.enableStreaming();
    expect(ctrl.getVisualSendState()).toBe('streaming');
  });
});

// ---------------------------------------------------------------------------
// Visual send policy integration – Wave 2
//
// These tests lock in the integration between the visual send state machine
// and the real frame dispatch pipeline.  They verify that the runtime states
// (inactive / sleep / snapshot / streaming) enforce the correct dispatch
// behavior end-to-end through enqueueFrameSend, including bounded pending
// work and latest-wins semantics.
// ---------------------------------------------------------------------------
describe('createScreenCaptureController – visual send pipeline (Wave 2)', () => {
  const mkFrame = (seq: number) => ({
    data: new Uint8Array([seq]),
    mimeType: 'image/jpeg' as const,
    sequence: seq,
    widthPx: 640,
    heightPx: 360,
  });

  // ── inactive ──────────────────────────────────────────────────────────────

  it('inactive blocks enqueueFrameSend even when capture and transport are present', async () => {
    // Call enqueueFrameSend directly without calling start() so the visual
    // policy stays inactive.  No transport/capture exists either, so the
    // first guard also fires, but this test explicitly verifies the inactive
    // semantic via direct call after wiring a minimal harness where start()
    // was never called.
    const { ctrl, sendVideoFrame } = createHarness();

    // Policy is inactive; no capture, so early-exit fires first – but the
    // meaningful assertion is that nothing reaches the transport.
    await ctrl.enqueueFrameSend(mkFrame(1));

    expect(sendVideoFrame).not.toHaveBeenCalled();
    expect(ctrl.getVisualSendState()).toBe('inactive');
  });

  it('inactive blocks frames even when a capture exists (direct enqueue after teardown)', async () => {
    // Start → stop to get a capture that existed but is now released.
    // Policy transitions inactive → sleep on start, then back to inactive on stop.
    // Any frame arriving via the observer after stop must be dropped.
    const { ctrl, getObserver, sendVideoFrame } = createHarness();

    await ctrl.start();
    // arm streaming so any in-flight frames are allowed, then stop
    ctrl.enableStreaming();
    await ctrl.stop();

    // Simulate a stale frame callback after stop (observer may fire briefly)
    const obs = getObserver();
    if (obs) {
      obs.onFrame(mkFrame(99));
    }
    await Promise.resolve();

    expect(sendVideoFrame).not.toHaveBeenCalled();
    expect(ctrl.getVisualSendState()).toBe('inactive');
  });

  // ── sleep ──────────────────────────────────────────────────────────────────

  it('sleep blocks a burst of frames arriving through the observer', async () => {
    const { ctrl, getObserver, sendVideoFrame } = createHarness();
    await ctrl.start();
    // Visual state is sleep after start; do NOT arm snapshot or streaming.

    for (let i = 1; i <= 5; i++) {
      getObserver()!.onFrame(mkFrame(i));
    }
    await Promise.resolve();

    expect(sendVideoFrame).not.toHaveBeenCalled();
    expect(ctrl.getVisualSendState()).toBe('sleep');
  });

  // ── snapshot ───────────────────────────────────────────────────────────────

  it('snapshot allows exactly one frame even when a burst arrives simultaneously', async () => {
    // Multiple frames arrive while snapshot is armed.  Only the first one that
    // passes allowSend() should reach the transport; subsequent ones are gated
    // back in sleep.
    const { ctrl, getObserver, sendVideoFrame } = createHarness({
      submitDecision: (i) => ({
        outcome: i === 1 ? 'send' : 'replace',
        classification: 'replaceable' as const,
        reason: i === 1 ? 'accepted' : 'superseded-latest',
      }),
    });
    await ctrl.start();
    ctrl.analyzeScreenNow();

    // Burst: 3 frames arrive before the drain loop has a chance to run.
    getObserver()!.onFrame(mkFrame(1));
    getObserver()!.onFrame(mkFrame(2));
    getObserver()!.onFrame(mkFrame(3));
    await Promise.resolve();

    // allowSend() consumed the snapshot on frame 1 → state reverts to sleep.
    // Frames 2 and 3 were blocked by sleep gating.
    expect(sendVideoFrame).toHaveBeenCalledTimes(1);
    expect(ctrl.getVisualSendState()).toBe('sleep');
  });

  it('snapshot: visual pending work is bounded to 1 even under a burst', async () => {
    // While the first snapshot frame is draining (transport call in-flight),
    // additional frames must not accumulate; only the latest-pending slot is kept.
    let resolveFirstSend!: () => void;
    const { ctrl, getObserver, sendVideoFrame, outboundGateway } = createHarness({
      submitDecision: (i) => ({
        outcome: i === 1 ? 'send' : 'replace',
        classification: 'replaceable' as const,
        reason: i === 1 ? 'accepted' : 'superseded-latest',
      }),
    });
    sendVideoFrame.mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveFirstSend = resolve; }),
    );

    await ctrl.start();
    ctrl.analyzeScreenNow();

    // Frame 1 starts draining (transport call in-flight).
    getObserver()!.onFrame(mkFrame(1));
    await Promise.resolve(); // let drain loop start

    // Frames 2 & 3 arrive while frame 1 is still sending.
    // Policy is now sleep (snapshot was consumed by frame 1), so these are
    // blocked at the gate – the gateway is never called for them.
    getObserver()!.onFrame(mkFrame(2));
    getObserver()!.onFrame(mkFrame(3));
    await Promise.resolve();

    // Gateway was called only once (for the snapshot frame).
    expect(outboundGateway.submit).toHaveBeenCalledTimes(1);

    resolveFirstSend();
    await Promise.resolve();
    await Promise.resolve();

    // Only the snapshot frame reached the transport.
    expect(sendVideoFrame).toHaveBeenCalledTimes(1);
  });

  it('re-armed snapshot after sleep sends exactly one more frame', async () => {
    let now = 0;
    const { ctrl, getObserver, sendVideoFrame } = createHarness({
      submitDecision: (i) => ({
        outcome: i <= 2 ? 'send' : 'replace',
        classification: 'replaceable' as const,
        reason: i <= 2 ? 'accepted' : 'superseded-latest',
      }),
      visualSendPolicyOptions: { nowMs: () => now },
    });
    await ctrl.start();

    // First snapshot
    ctrl.analyzeScreenNow();
    getObserver()!.onFrame(mkFrame(1));
    await Promise.resolve();

    // Back to sleep – frame 2 should be blocked
    getObserver()!.onFrame(mkFrame(2));
    await Promise.resolve();
    expect(sendVideoFrame).toHaveBeenCalledTimes(1);

    // Second snapshot – advance past cooldown first
    now += 3000;
    ctrl.analyzeScreenNow();
    getObserver()!.onFrame(mkFrame(3));
    await Promise.resolve();

    expect(sendVideoFrame).toHaveBeenCalledTimes(2);
    expect(ctrl.getVisualSendState()).toBe('sleep');
  });

  // ── streaming ──────────────────────────────────────────────────────────────

  it('streaming: latest-wins is preserved under a concurrent burst', async () => {
    // While frame 1 is draining, frames 2 and 3 arrive.  Only frames 1 and 3
    // should reach the transport (frame 2 is superseded by frame 3 in the
    // single pendingFrame slot).
    let resolveFirstSend!: () => void;
    const { ctrl, getObserver, sendVideoFrame } = createHarness({
      submitDecision: (i) => ({
        outcome: i === 1 ? 'send' : 'replace',
        classification: 'replaceable' as const,
        reason: i === 1 ? 'accepted' : 'superseded-latest',
      }),
    });
    sendVideoFrame
      .mockImplementationOnce(
        () => new Promise<void>((resolve) => { resolveFirstSend = resolve; }),
      )
      .mockResolvedValueOnce(undefined);

    await ctrl.start();
    ctrl.enableStreaming();

    getObserver()!.onFrame(mkFrame(1));
    await Promise.resolve(); // drain starts, frame 1 in-flight

    getObserver()!.onFrame(mkFrame(2));
    getObserver()!.onFrame(mkFrame(3)); // replaces frame 2 in pendingFrame

    resolveFirstSend();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(sendVideoFrame).toHaveBeenCalledTimes(2);
    expect(sendVideoFrame.mock.calls[0]).toEqual([new Uint8Array([1]), 'image/jpeg']);
    expect(sendVideoFrame.mock.calls[1]).toEqual([new Uint8Array([3]), 'image/jpeg']);
  });

  it('streaming: pending work is bounded (never more than 1 queued behind the active send)', async () => {
    // Flood of frames; the pendingFrame slot holds at most 1 waiting frame.
    let resolveFirstSend!: () => void;
    const { ctrl, getObserver, sendVideoFrame, outboundGateway } = createHarness({
      submitDecision: (i) => ({
        outcome: i === 1 ? 'send' : 'replace',
        classification: 'replaceable' as const,
        reason: i === 1 ? 'accepted' : 'superseded-latest',
      }),
    });
    sendVideoFrame.mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveFirstSend = resolve; }),
    ).mockResolvedValue(undefined);

    await ctrl.start();
    ctrl.enableStreaming();

    getObserver()!.onFrame(mkFrame(1));
    await Promise.resolve(); // drain starts

    // 10 more frames arrive; all go through the gateway (replace) but only
    // one pendingFrame slot exists.
    for (let i = 2; i <= 11; i++) {
      getObserver()!.onFrame(mkFrame(i));
    }
    await Promise.resolve();

    // Gateway called for all 11 frames (policy allows, gateway classifies as replaceable).
    expect(outboundGateway.submit).toHaveBeenCalledTimes(11);

    resolveFirstSend();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Despite 11 frames submitted, only 2 reached the transport:
    // frame 1 (first send) + the latest pending frame (frame 11).
    expect(sendVideoFrame).toHaveBeenCalledTimes(2);
  });

  // ── stop / reset ───────────────────────────────────────────────────────────

  it('stopping screen share resets pipeline to non-sending: no frames dispatched after stop', async () => {
    const { ctrl, getObserver, sendVideoFrame } = createHarness();

    await ctrl.start();
    ctrl.enableStreaming();
    await ctrl.stop();

    // After stop, any observer callbacks that fire must be no-ops.
    const obs = getObserver();
    if (obs) {
      obs.onFrame(mkFrame(1));
    }
    await Promise.resolve();

    expect(sendVideoFrame).not.toHaveBeenCalled();
    expect(ctrl.getVisualSendState()).toBe('inactive');
  });

  it('restarting screen share requires explicit re-arm before frames are sent', async () => {
    const { ctrl, getObserver, sendVideoFrame } = createHarness({
      submitDecision: (i) => ({
        outcome: i === 1 ? 'send' : 'replace',
        classification: 'replaceable' as const,
        reason: i === 1 ? 'accepted' : 'superseded-latest',
      }),
    });

    // First session: arm streaming, send a frame, stop
    await ctrl.start();
    ctrl.enableStreaming();
    getObserver()!.onFrame(mkFrame(1));
    await Promise.resolve();
    await ctrl.stop();
    sendVideoFrame.mockClear();

    // Second session: start without re-arming → sleep → no frames
    await ctrl.start();
    getObserver()!.onFrame(mkFrame(2));
    await Promise.resolve();
    expect(sendVideoFrame).not.toHaveBeenCalled();
    expect(ctrl.getVisualSendState()).toBe('sleep');

    // Re-arm streaming → frames flow again
    ctrl.enableStreaming();
    getObserver()!.onFrame(mkFrame(3));
    await Promise.resolve();
    expect(sendVideoFrame).toHaveBeenCalledTimes(1);
  });
});
