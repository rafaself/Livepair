import { describe, expect, it, vi } from 'vitest';
import { createScreenCaptureController } from './screenCaptureController';
import type { DesktopSession, VoiceSessionStatus } from './types';
import type { LocalScreenCaptureObserver } from './localScreenCapture';

function createHarness(options: { voiceSessionStatus?: VoiceSessionStatus; screenCaptureState?: string } = {}) {
  const { voiceSessionStatus = 'ready', screenCaptureState = 'disabled' } = options;
  let currentScreenState = screenCaptureState;
  let currentVoiceStatus: VoiceSessionStatus = voiceSessionStatus;

  const setScreenCaptureState = vi.fn((s: string) => { currentScreenState = s; });
  const setScreenCaptureDiagnostics = vi.fn();
  const setLastRuntimeError = vi.fn();
  const store = {
    getState: () => ({
      voiceSessionStatus: currentVoiceStatus,
      screenCaptureState: currentScreenState,
      setScreenCaptureState,
      setScreenCaptureDiagnostics,
      setLastRuntimeError,
    }),
  };

  let capturedObserver: LocalScreenCaptureObserver | null = null;
  const mockCapture = {
    start: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
  };
  const createCapture = vi.fn((observer: LocalScreenCaptureObserver) => {
    capturedObserver = observer;
    return mockCapture;
  });

  const sendVideoFrame = vi.fn(() => Promise.resolve());
  const transport = { sendVideoFrame } as unknown as DesktopSession;
  let currentTransport: DesktopSession | null = transport;

  const ctrl = createScreenCaptureController(store, createCapture, () => currentTransport);

  return {
    ctrl,
    store: { setScreenCaptureState, setScreenCaptureDiagnostics, setLastRuntimeError },
    mockCapture,
    createCapture,
    sendVideoFrame,
    getObserver: () => capturedObserver,
    setTransport: (t: DesktopSession | null) => { currentTransport = t; },
    setVoiceStatus: (s: VoiceSessionStatus) => { currentVoiceStatus = s; },
    setScreenState: (s: string) => { currentScreenState = s; },
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

  it('start rejects when voice session is not active', async () => {
    const { ctrl, store } = createHarness({ voiceSessionStatus: 'disconnected' });

    await ctrl.start();

    expect(store.setScreenCaptureState).toHaveBeenCalledWith('error');
    expect(store.setLastRuntimeError).toHaveBeenCalledWith(
      'Screen context requires an active voice session',
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
    const { ctrl, sendVideoFrame, store } = createHarness();

    await ctrl.start();
    const frame = { data: new Uint8Array([1, 2]), mimeType: 'image/jpeg' };
    await ctrl.enqueueFrameSend(frame);

    expect(sendVideoFrame).toHaveBeenCalledWith(frame.data, frame.mimeType);
    expect(store.setScreenCaptureDiagnostics).toHaveBeenCalledWith({
      lastUploadStatus: 'sending',
      lastError: null,
    });
  });

  it('enqueueFrameSend is no-op without transport', async () => {
    const { ctrl, setTransport, sendVideoFrame } = createHarness();

    await ctrl.start();
    setTransport(null);
    const frame = { data: new Uint8Array([1]), mimeType: 'image/png' };
    const result = await ctrl.enqueueFrameSend(frame);

    expect(result).toBeUndefined();
    expect(sendVideoFrame).not.toHaveBeenCalled();
  });

  it('enqueueFrameSend is no-op without active capture', async () => {
    const { ctrl, sendVideoFrame } = createHarness();

    // Not started, so no capture
    const frame = { data: new Uint8Array([1]), mimeType: 'image/png' };
    await ctrl.enqueueFrameSend(frame);

    expect(sendVideoFrame).not.toHaveBeenCalled();
  });

  it('observer onError triggers stopInternal with error state', async () => {
    const { ctrl, store, getObserver } = createHarness();

    await ctrl.start();
    getObserver()!.onError('device lost');

    expect(store.setLastRuntimeError).toHaveBeenCalledWith('device lost');
  });

  it('observer onDiagnostics patches store', async () => {
    const { ctrl, store, getObserver } = createHarness();

    await ctrl.start();
    getObserver()!.onDiagnostics({ frameCount: 42 });

    expect(store.setScreenCaptureDiagnostics).toHaveBeenCalledWith({ frameCount: 42 });
  });

  it('start allowed for all active voice statuses', async () => {
    for (const status of ['ready', 'capturing', 'streaming', 'recovering', 'interrupted'] as VoiceSessionStatus[]) {
      const { ctrl, createCapture } = createHarness({ voiceSessionStatus: status });
      await ctrl.start();
      expect(createCapture).toHaveBeenCalledTimes(1);
    }
  });
});
