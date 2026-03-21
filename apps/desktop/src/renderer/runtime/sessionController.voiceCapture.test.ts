import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDesktopSessionController } from './sessionController';
import { useSessionStore } from '../store/sessionStore';
import { useSettingsStore } from '../store/settingsStore';
import { useUiStore } from '../store/uiStore';
import { resetDesktopStoresWithDefaults } from '../test/store';
import { DEFAULT_DESKTOP_SETTINGS } from '../../shared/settings';
import {
  createUnusedTransport,
  createVoiceTransportHarness,
  createVoiceCaptureHarness,
} from './sessionController.testUtils';

describe('createDesktopSessionController – voice capture', () => {
  beforeEach(() => {
    resetDesktopStoresWithDefaults();
  });

  it('auto-starts local voice capture with speech session start, publishes chunks, and updates diagnostics without affecting text mode', async () => {
    const voiceCapture = createVoiceCaptureHarness();
    const voiceTransport = createVoiceTransportHarness();
    useUiStore.setState({ isDebugMode: true });
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_DESKTOP_SETTINGS,
        selectedInputDeviceId: 'usb-mic',
        voiceEchoCancellationEnabled: false,
        voiceNoiseSuppressionEnabled: true,
        voiceAutoGainControlEnabled: false,
      },
      isReady: true,
    });
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn(() => voiceTransport.transport),
      createVoiceCapture: voiceCapture.createVoiceCapture,
      settingsStore: useSettingsStore,
    });
    const chunkListener = vi.fn();
    const unsubscribe = controller.subscribeToVoiceChunks(chunkListener);

    await controller.startSession({ mode: 'speech' });
    voiceCapture.emitChunk();
    await Promise.resolve();
    await Promise.resolve();
    voiceCapture.emitDiagnostics({
      chunkCount: 1,
      sampleRateHz: 16_000,
      bytesPerChunk: 640,
      chunkDurationMs: 20,
    });

    expect(voiceCapture.start).toHaveBeenCalledWith({
      selectedInputDeviceId: 'usb-mic',
      echoCancellationEnabled: false,
      noiseSuppressionEnabled: true,
      autoGainControlEnabled: false,
    });
    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        currentMode: 'speech',
        voiceCaptureState: 'capturing',
        voiceSessionStatus: 'streaming',
        textSessionLifecycle: expect.objectContaining({ status: 'disconnected' }),
      }),
    );
    expect(useSessionStore.getState().voiceCaptureDiagnostics).toEqual(
      expect.objectContaining({
        chunkCount: 1,
        sampleRateHz: 16_000,
        bytesPerChunk: 640,
        chunkDurationMs: 20,
        selectedInputDeviceId: 'usb-mic',
        lastError: null,
      }),
    );
    expect(chunkListener).toHaveBeenCalledWith(
      expect.objectContaining({
        encoding: 'pcm_s16le',
        durationMs: 20,
      }),
    );
    expect(voiceTransport.sendAudioChunk).toHaveBeenCalledWith(
      new Uint8Array(640).fill(1),
    );

    unsubscribe();
  });

  it('stops local voice capture cleanly, flushes audio, and returns the session to ready', async () => {
    const voiceCapture = createVoiceCaptureHarness();
    const voiceTransport = createVoiceTransportHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn(() => voiceTransport.transport),
      createVoiceCapture: voiceCapture.createVoiceCapture,
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'speech' });
    voiceCapture.emitChunk();
    await controller.stopVoiceCapture();

    expect(voiceCapture.stop).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().voiceCaptureState).toBe('stopped');
    expect(useSessionStore.getState().voiceSessionStatus).toBe('ready');
    expect(voiceTransport.sendAudioStreamEnd).toHaveBeenCalledTimes(1);
  });

  it('resumes local voice capture after mute without reconnecting the speech session', async () => {
    const voiceCapture = createVoiceCaptureHarness();
    const voiceTransport = createVoiceTransportHarness();
    const requestSessionToken = vi.fn().mockResolvedValue({
      token: 'auth_tokens/test-token',
      expireTime: '2099-03-09T12:30:00.000Z',
      newSessionExpireTime: '2099-03-09T12:01:30.000Z',
    });
    const createTransport = vi.fn(() => voiceTransport.transport);
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken,
      createTransport,
      createVoiceCapture: voiceCapture.createVoiceCapture,
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'speech' });
    await controller.stopVoiceCapture();
    await controller.startVoiceCapture();

    expect(requestSessionToken).toHaveBeenCalledTimes(1);
    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(voiceCapture.start).toHaveBeenCalledTimes(2);
    expect(useSessionStore.getState().voiceCaptureState).toBe('capturing');
    expect(useSessionStore.getState().voiceSessionStatus).toBe('ready');
  });

  it('rejects microphone capture until the voice session is connected', async () => {
    const voiceCapture = createVoiceCaptureHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken: vi.fn(),
      createTransport: vi.fn(() => createUnusedTransport()),
      createVoiceCapture: voiceCapture.createVoiceCapture,
      settingsStore: useSettingsStore,
    });

    await controller.startVoiceCapture();

    expect(voiceCapture.start).not.toHaveBeenCalled();
    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        voiceSessionStatus: 'disconnected',
        voiceCaptureState: 'error',
        voiceCaptureDiagnostics: expect.objectContaining({
          lastError: 'Voice session is not ready',
        }),
      }),
    );
  });

  it('keeps the speech session active when mic auto-start fails during session start', async () => {
    const voiceCapture = createVoiceCaptureHarness();
    const voiceTransport = createVoiceTransportHarness();
    voiceCapture.start.mockRejectedValueOnce(new Error('Microphone permission was denied'));
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn(() => voiceTransport.transport),
      createVoiceCapture: voiceCapture.createVoiceCapture,
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'speech' });

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        currentMode: 'speech',
        voiceCaptureState: 'error',
        voiceSessionStatus: 'ready',
        voiceCaptureDiagnostics: expect.objectContaining({
          lastError: 'Microphone permission was denied',
        }),
        textSessionLifecycle: expect.objectContaining({ status: 'disconnected' }),
      }),
    );
  });
});
