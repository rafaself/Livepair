import { describe, expect, it, vi } from 'vitest';
import type { DesktopSession } from '../../transport/transport.types';
import type { VoiceSessionStatus } from '../../voice/voice.types';
import type { LocalScreenCaptureObserver } from '../localScreenCapture';
import type {
  ScreenCaptureDiagnostics,
  ScreenCaptureState,
} from '../screen.types';
import { SCREEN_CAPTURE_START_POLICY } from '../screenCapturePolicy';
import type { ScreenCaptureStoreApi } from './screenCaptureControllerTypes';
import { createScreenCaptureControllerState } from './screenCaptureControllerState';
import {
  createDeferred,
  createMockScreenCapture,
  createScreenFrame,
  createTransportMock,
} from './controllerTestUtils';
import { createScreenCaptureLifecycle } from './screenCaptureLifecycle';

function createStoreHarness(options: {
  voiceSessionStatus?: VoiceSessionStatus;
  screenCaptureState?: ScreenCaptureState;
} = {}) {
  let currentVoiceStatus = options.voiceSessionStatus ?? 'ready';
  let currentScreenState = options.screenCaptureState ?? 'disabled';

  const setScreenCaptureState = vi.fn((nextState: ScreenCaptureState) => {
    currentScreenState = nextState;
  });
  const setScreenCaptureDiagnostics = vi.fn(
    (_patch: Partial<ScreenCaptureDiagnostics>) => undefined,
  );
  const setLastRuntimeError = vi.fn((_error: string | null) => undefined);
  const setVisualSendDiagnostics = vi.fn();

  const store: ScreenCaptureStoreApi = {
    getState: () => ({
      voiceSessionStatus: currentVoiceStatus,
      screenCaptureState: currentScreenState,
      setScreenCaptureState,
      setScreenCaptureDiagnostics,
      setVisualSendDiagnostics,
      setLastRuntimeError,
    }),
  };

  return {
    store,
    setLastRuntimeError,
    setScreenCaptureDiagnostics,
    setScreenCaptureState,
    setVoiceStatus: (status: VoiceSessionStatus) => {
      currentVoiceStatus = status;
    },
    setScreenState: (state: ScreenCaptureState) => {
      currentScreenState = state;
    },
  };
}

function createHarness(options: {
  voiceSessionStatus?: VoiceSessionStatus;
  screenCaptureState?: ScreenCaptureState;
  getCaptureStartParams?: () => { jpegQuality?: number; maxWidthPx?: number };
} = {}) {
  const storeHarness = createStoreHarness(options);
  const controllerState = createScreenCaptureControllerState();
  const capture = createMockScreenCapture();
  let observer: LocalScreenCaptureObserver | null = null;
  const createCapture = vi.fn((nextObserver: LocalScreenCaptureObserver) => {
    observer = nextObserver;
    return capture;
  });
  const { transport } = createTransportMock();
  let currentTransport: DesktopSession | null = transport;
  const resetDiagnostics = vi.fn();
  const frameDumpCoordinator = {
    reset: vi.fn(),
    startSession: vi.fn(async () => undefined),
    persistFrame: vi.fn(),
  };
  const frameSendCoordinator = {
    reset: vi.fn(),
    enqueueFrameSend: vi.fn(async () => undefined),
  };
  const onFrameCaptured = vi.fn();
  const onScreenShareStarted = vi.fn();
  const onScreenShareStopped = vi.fn();

  const lifecycle = createScreenCaptureLifecycle({
    store: storeHarness.store,
    controllerState,
    createCapture,
    getTransport: () => currentTransport,
    resetDiagnostics,
    frameDumpCoordinator,
    frameSendCoordinator,
    onFrameCaptured,
    ...(options.getCaptureStartParams
      ? { getCaptureStartParams: options.getCaptureStartParams }
      : {}),
    onScreenShareStarted,
    onScreenShareStopped,
  });

  return {
    capture,
    controllerState,
    createCapture,
    frameDumpCoordinator,
    frameSendCoordinator,
    getObserver: () => observer,
    lifecycle,
    onFrameCaptured,
    onScreenShareStarted,
    onScreenShareStopped,
    resetDiagnostics,
    setTransport: (nextTransport: DesktopSession | null) => {
      currentTransport = nextTransport;
    },
    storeHarness,
  };
}

describe('createScreenCaptureLifecycle', () => {
  it('starts capture, primes dump startup, and transitions to capturing', async () => {
    const harness = createHarness();

    await harness.lifecycle.start();

    expect(harness.createCapture).toHaveBeenCalledTimes(1);
    expect(harness.capture.start).toHaveBeenCalledWith(SCREEN_CAPTURE_START_POLICY);
    expect(harness.frameDumpCoordinator.startSession).toHaveBeenCalledWith(
      harness.capture,
      1,
    );
    expect(harness.storeHarness.setScreenCaptureState).toHaveBeenCalledWith(
      'requestingPermission',
    );
    expect(harness.storeHarness.setScreenCaptureState).toHaveBeenCalledWith('ready');
    expect(harness.storeHarness.setScreenCaptureState).toHaveBeenCalledWith(
      'capturing',
    );
    expect(harness.onScreenShareStarted).toHaveBeenCalledTimes(1);
    expect(harness.lifecycle.isActive()).toBe(true);
  });

  it('merges capture start params into the default start policy', async () => {
    const harness = createHarness({
      getCaptureStartParams: () => ({
        jpegQuality: 0.5,
        maxWidthPx: 640,
      }),
    });

    await harness.lifecycle.start();

    expect(harness.capture.start).toHaveBeenCalledWith({
      ...SCREEN_CAPTURE_START_POLICY,
      jpegQuality: 0.5,
      maxWidthPx: 640,
    });
  });

  it('rejects start when the voice session is not active', async () => {
    const harness = createHarness({
      voiceSessionStatus: 'disconnected',
    });

    await harness.lifecycle.start();

    expect(harness.createCapture).not.toHaveBeenCalled();
    expect(harness.storeHarness.setScreenCaptureState).toHaveBeenCalledWith('error');
    expect(harness.storeHarness.setScreenCaptureDiagnostics).toHaveBeenCalledWith({
      lastError: 'Screen context requires an active Live session',
      lastUploadStatus: 'error',
    });
    expect(harness.storeHarness.setLastRuntimeError).toHaveBeenCalledWith(
      'Screen context requires an active Live session',
    );
  });

  it('rejects start when there is no active transport', async () => {
    const harness = createHarness();
    harness.setTransport(null);

    await harness.lifecycle.start();

    expect(harness.createCapture).not.toHaveBeenCalled();
    expect(harness.storeHarness.setScreenCaptureState).toHaveBeenCalledWith('error');
  });

  it('no-ops while screen capture is already active or changing state', async () => {
    for (const state of [
      'requestingPermission',
      'ready',
      'capturing',
      'streaming',
      'stopping',
    ] as const) {
      const harness = createHarness({ screenCaptureState: state });
      await harness.lifecycle.start();
      expect(harness.createCapture).not.toHaveBeenCalled();
    }
  });

  it('handles capture.start failures by surfacing error diagnostics', async () => {
    const harness = createHarness();
    harness.capture.start.mockRejectedValueOnce(new Error('permission denied'));

    await harness.lifecycle.start();

    expect(harness.storeHarness.setScreenCaptureState).toHaveBeenCalledWith('error');
    expect(harness.storeHarness.setScreenCaptureDiagnostics).toHaveBeenCalledWith({
      lastError: 'permission denied',
      lastUploadStatus: 'error',
    });
    expect(harness.storeHarness.setLastRuntimeError).toHaveBeenCalledWith(
      'permission denied',
    );
    expect(harness.lifecycle.isActive()).toBe(false);
  });

  it('stop resets collaborators and transitions through stopping to disabled', async () => {
    const harness = createHarness();

    await harness.lifecycle.start();
    harness.storeHarness.setScreenCaptureState.mockClear();
    harness.resetDiagnostics.mockClear();

    await harness.lifecycle.stop();

    expect(harness.frameDumpCoordinator.reset).toHaveBeenCalledTimes(1);
    expect(harness.frameSendCoordinator.reset).toHaveBeenCalledTimes(1);
    expect(harness.capture.stop).toHaveBeenCalledTimes(1);
    expect(harness.onScreenShareStopped).toHaveBeenCalledTimes(1);
    expect(harness.storeHarness.setScreenCaptureState.mock.calls).toEqual([
      ['stopping'],
      ['disabled'],
    ]);
    expect(harness.resetDiagnostics).toHaveBeenCalledTimes(1);
    expect(harness.lifecycle.isActive()).toBe(false);
  });

  it('stop without an active capture still resets to disabled', async () => {
    const harness = createHarness({ screenCaptureState: 'error' });

    await harness.lifecycle.stop();

    expect(harness.storeHarness.setScreenCaptureState).toHaveBeenCalledWith(
      'disabled',
    );
    expect(harness.resetDiagnostics).toHaveBeenCalledTimes(1);
  });

  it('stopInternal without preserveDiagnostics resets diagnostics', async () => {
    const harness = createHarness();

    await harness.lifecycle.stopInternal();

    expect(harness.resetDiagnostics).toHaveBeenCalledTimes(1);
  });

  it('stopInternal without capture preserves the requested diagnostics when asked', async () => {
    const harness = createHarness();

    await harness.lifecycle.stopInternal({
      nextState: 'error',
      detail: 'test',
      preserveDiagnostics: true,
      uploadStatus: 'error',
    });

    expect(harness.storeHarness.setScreenCaptureState).toHaveBeenCalledWith('error');
    expect(harness.storeHarness.setScreenCaptureDiagnostics).toHaveBeenCalledWith({
      lastUploadStatus: 'error',
      lastError: 'test',
    });
  });

  it('waits for an in-flight stop before creating the next capture', async () => {
    const harness = createHarness();
    const deferredStop = createDeferred<void>();

    await harness.lifecycle.start();
    harness.capture.stop.mockImplementationOnce(() => deferredStop.promise);

    const stopPromise = harness.lifecycle.stop();
    await Promise.resolve();

    const restartPromise = harness.lifecycle.start();
    await Promise.resolve();

    expect(harness.createCapture).toHaveBeenCalledTimes(1);

    deferredStop.resolve();
    await stopPromise;
    await restartPromise;

    expect(harness.createCapture).toHaveBeenCalledTimes(2);
  });

  it('routes observer frames to dump persistence and frame sending', async () => {
    const harness = createHarness();
    const frame = createScreenFrame(21, 6);

    await harness.lifecycle.start();
    harness.getObserver()?.onFrame(frame);
    await Promise.resolve();

    expect(harness.onFrameCaptured).toHaveBeenCalledWith(frame);
    expect(harness.frameDumpCoordinator.persistFrame).toHaveBeenCalledWith(
      harness.capture,
      1,
      frame,
    );
    expect(harness.frameSendCoordinator.enqueueFrameSend).toHaveBeenCalledWith(frame);
  });

  it('patches diagnostics from the current capture observer', async () => {
    const harness = createHarness();

    await harness.lifecycle.start();
    harness.getObserver()?.onDiagnostics({ frameCount: 42 });

    expect(harness.storeHarness.setScreenCaptureDiagnostics).toHaveBeenCalledWith({
      frameCount: 42,
    });
  });

  it('stops the current capture when the observer reports an error', async () => {
    const harness = createHarness();

    await harness.lifecycle.start();
    harness.getObserver()?.onError('device lost');

    await vi.waitFor(() => {
      expect(harness.capture.stop).toHaveBeenCalledTimes(1);
      expect(harness.storeHarness.setLastRuntimeError).toHaveBeenCalledWith(
        'device lost',
      );
      expect(harness.storeHarness.setScreenCaptureState.mock.calls.slice(-2)).toEqual(
        [['stopping'], ['error']],
      );
      expect(harness.storeHarness.setScreenCaptureDiagnostics).toHaveBeenLastCalledWith({
        lastUploadStatus: 'error',
        lastError: 'device lost',
      });
    });
  });

  it('allows start for every active voice session status', async () => {
    for (const status of [
      'ready',
      'capturing',
      'streaming',
      'interrupted',
    ] satisfies VoiceSessionStatus[]) {
      const harness = createHarness({ voiceSessionStatus: status });
      await harness.lifecycle.start();
      expect(harness.createCapture).toHaveBeenCalledTimes(1);
    }
  });
});
