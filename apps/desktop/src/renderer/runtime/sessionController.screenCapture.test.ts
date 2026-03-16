import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDesktopSessionController } from './sessionController';
import { DEFAULT_DESKTOP_SETTINGS } from '../../shared';
import { useSessionStore } from '../store/sessionStore';
import { useSettingsStore } from '../store/settingsStore';
import { resetDesktopStoresWithDefaults } from '../test/store';
import {
  createScreenCaptureHarness,
  createVoiceTransportHarness,
} from './sessionController.testUtils';
import type { ScreenFrameAnalysis } from './screen/screenFrameAnalysis';

function createChangedAnalysis(): ScreenFrameAnalysis {
  const tileLuminance = new Array(40).fill(32);
  const tileEdge = new Array(40).fill(2);

  tileLuminance[18] = 180;
  tileLuminance[19] = 150;
  tileEdge[18] = 120;
  tileEdge[19] = 96;

  return {
    widthPx: 160,
    heightPx: 90,
    tileLuminance,
    tileEdge,
    perceptualHash: 0b1111000011110000n,
  };
}

describe('createDesktopSessionController – Wave 4 screen capture', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetDesktopStoresWithDefaults();
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_DESKTOP_SETTINGS,
        screenContextMode: 'continuous',
      },
      isReady: true,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('manual mode stays explicit-send only', async () => {
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_DESKTOP_SETTINGS,
        screenContextMode: 'manual',
      },
      isReady: true,
    });
    const voiceTransport = createVoiceTransportHarness();
    const screenCapture = createScreenCaptureHarness();
    const controller = createDesktopSessionController({
      logger: { onSessionEvent: vi.fn(), onTransportEvent: vi.fn() },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn(() => voiceTransport.transport),
      createScreenCapture: screenCapture.createScreenCapture,
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'speech' });
    await controller.startScreenCapture();
    screenCapture.emitFrame({ sequence: 1 });
    await vi.advanceTimersByTimeAsync(4000);

    expect(voiceTransport.sendVideoFrame).not.toHaveBeenCalled();

    controller.analyzeScreenNow();
    screenCapture.emitFrame({ sequence: 2 });

    await vi.waitFor(() => {
      expect(voiceTransport.sendVideoFrame).toHaveBeenCalledTimes(1);
      expect(voiceTransport.sendVideoFrame).toHaveBeenLastCalledWith(
        new Uint8Array([1, 2, 3]),
        'image/jpeg',
      );
    });
  });

  it('auto-sends every 3 seconds in continuous mode without extra actions', async () => {
    const voiceTransport = createVoiceTransportHarness();
    const screenCapture = createScreenCaptureHarness();
    const controller = createDesktopSessionController({
      logger: { onSessionEvent: vi.fn(), onTransportEvent: vi.fn() },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn(() => voiceTransport.transport),
      createScreenCapture: screenCapture.createScreenCapture,
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'speech' });
    await controller.startScreenCapture();

    screenCapture.emitFrame({ sequence: 1 });
    await vi.advanceTimersByTimeAsync(2999);
    expect(voiceTransport.sendVideoFrame).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(voiceTransport.sendVideoFrame).toHaveBeenCalledTimes(1);

    screenCapture.emitFrame({ sequence: 2 });
    await vi.advanceTimersByTimeAsync(3000);
    expect(voiceTransport.sendVideoFrame).toHaveBeenCalledTimes(2);
  });

  it('bursts to 1 second after meaningful screen changes and then returns to the 3 second baseline', async () => {
    const voiceTransport = createVoiceTransportHarness();
    const screenCapture = createScreenCaptureHarness();
    const controller = createDesktopSessionController({
      logger: { onSessionEvent: vi.fn(), onTransportEvent: vi.fn() },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn(() => voiceTransport.transport),
      createScreenCapture: screenCapture.createScreenCapture,
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'speech' });
    await controller.startScreenCapture();

    screenCapture.emitFrame({ sequence: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    screenCapture.emitFrame({ sequence: 2 });
    await vi.advanceTimersByTimeAsync(1000);
    screenCapture.emitFrame({ sequence: 3 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(voiceTransport.sendVideoFrame).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(500);
    screenCapture.emitFrame({
      sequence: 4,
      analysis: createChangedAnalysis(),
    });

    await vi.advanceTimersByTimeAsync(999);
    expect(voiceTransport.sendVideoFrame).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(voiceTransport.sendVideoFrame).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1499);
    expect(voiceTransport.sendVideoFrame).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1);
    expect(voiceTransport.sendVideoFrame).toHaveBeenCalledTimes(3);
  });

  it('continuous sending does not depend on text sends and is not accelerated by them', async () => {
    const voiceTransport = createVoiceTransportHarness();
    const screenCapture = createScreenCaptureHarness();
    const controller = createDesktopSessionController({
      logger: { onSessionEvent: vi.fn(), onTransportEvent: vi.fn() },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn(() => voiceTransport.transport),
      createScreenCapture: screenCapture.createScreenCapture,
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'speech' });
    await controller.startScreenCapture();

    screenCapture.emitFrame({ sequence: 1 });
    await vi.advanceTimersByTimeAsync(1500);
    await controller.submitTextTurn('Check the shared screen');

    expect(voiceTransport.sendText).toHaveBeenCalledWith('Check the shared screen');
    expect(voiceTransport.sendVideoFrame).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1499);
    expect(voiceTransport.sendVideoFrame).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(voiceTransport.sendVideoFrame).toHaveBeenCalledTimes(1);
  });

  it('stops and restarts deterministic continuous sending on mode changes', async () => {
    const voiceTransport = createVoiceTransportHarness();
    const screenCapture = createScreenCaptureHarness();
    const controller = createDesktopSessionController({
      logger: { onSessionEvent: vi.fn(), onTransportEvent: vi.fn() },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn(() => voiceTransport.transport),
      createScreenCapture: screenCapture.createScreenCapture,
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'speech' });
    await controller.startScreenCapture();

    screenCapture.emitFrame({ sequence: 1 });
    await vi.advanceTimersByTimeAsync(3000);
    expect(voiceTransport.sendVideoFrame).toHaveBeenCalledTimes(1);

    useSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        screenContextMode: 'manual',
      },
    }));
    screenCapture.emitFrame({ sequence: 2 });
    await vi.advanceTimersByTimeAsync(6000);
    expect(voiceTransport.sendVideoFrame).toHaveBeenCalledTimes(1);

    useSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        screenContextMode: 'continuous',
      },
    }));
    screenCapture.emitFrame({ sequence: 3 });
    await vi.advanceTimersByTimeAsync(3000);

    expect(voiceTransport.sendVideoFrame).toHaveBeenCalledTimes(2);
    expect(useSessionStore.getState().screenCaptureState).toBe('capturing');
  });

  it('removes legacy explicit streaming controls from the public controller', () => {
    const controller = createDesktopSessionController({
      logger: { onSessionEvent: vi.fn(), onTransportEvent: vi.fn() },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken: vi.fn(),
      createTransport: vi.fn(),
      createScreenCapture: vi.fn(),
      settingsStore: useSettingsStore,
    });

    expect('enableScreenStreaming' in controller).toBe(false);
    expect('stopScreenStreaming' in controller).toBe(false);
  });
});
