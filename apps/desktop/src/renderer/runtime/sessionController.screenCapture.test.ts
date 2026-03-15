import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDesktopSessionController } from './sessionController';
import { useSessionStore } from '../store/sessionStore';
import { useSettingsStore } from '../store/settingsStore';
import { resetDesktopStoresWithDefaults } from '../test/store';
import {
  createUnusedTransport,
  createVoiceTransportHarness,
  createScreenCaptureHarness,
} from './sessionController.testUtils';

describe('createDesktopSessionController – screen capture', () => {
  beforeEach(() => {
    resetDesktopStoresWithDefaults();
  });

  it('starts screen capture in an active voice session and sends frames via transport', async () => {
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

    expect(screenCapture.start).toHaveBeenCalledOnce();
    expect(useSessionStore.getState().screenCaptureState).toBe('capturing');
    expect(useSessionStore.getState().screenCaptureDiagnostics.lastUploadStatus).toBe('idle');

    controller.analyzeScreenNow();
    screenCapture.emitFrame({ data: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg', sequence: 1, widthPx: 640, heightPx: 360 });

    await vi.waitFor(() => {
      expect(voiceTransport.sendVideoFrame).toHaveBeenCalledWith(
        new Uint8Array([1, 2, 3]),
        'image/jpeg',
      );
      expect(useSessionStore.getState().screenCaptureState).toBe('streaming');
      expect(useSessionStore.getState().screenCaptureDiagnostics.lastUploadStatus).toBe('sent');
    });
  });

  it('keeps screen capture manual-only when speech mode starts', async () => {
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

    expect(screenCapture.start).not.toHaveBeenCalled();
    expect(useSessionStore.getState().screenCaptureState).toBe('disabled');
  });

  it('rejects startScreenCapture when not in an active voice session', async () => {
    const screenCapture = createScreenCaptureHarness();
    const controller = createDesktopSessionController({
      logger: { onSessionEvent: vi.fn(), onTransportEvent: vi.fn() },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken: vi.fn(),
      createTransport: vi.fn(() => createUnusedTransport()),
      createScreenCapture: screenCapture.createScreenCapture,
      settingsStore: useSettingsStore,
    });

    await controller.startScreenCapture();

    expect(screenCapture.start).not.toHaveBeenCalled();
    expect(useSessionStore.getState().screenCaptureState).toBe('error');
    expect(useSessionStore.getState().lastRuntimeError).toBe(
      'Screen context requires an active Live session',
    );
  });

  it('stops screen capture cleanly and resets state to disabled', async () => {
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
    expect(useSessionStore.getState().screenCaptureState).toBe('capturing');

    await controller.stopScreenCapture();

    expect(screenCapture.stop).toHaveBeenCalledOnce();
    expect(useSessionStore.getState().screenCaptureState).toBe('disabled');
  });

  it('supports repeated manual screen toggles without breaking the voice session', async () => {
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
    await controller.stopScreenCapture();
    await controller.startScreenCapture();

    controller.analyzeScreenNow();
    screenCapture.emitFrame({ sequence: 2 });

    await vi.waitFor(() => {
      expect(screenCapture.start).toHaveBeenCalledTimes(2);
      expect(screenCapture.stop).toHaveBeenCalledTimes(1);
      expect(voiceTransport.sendVideoFrame).toHaveBeenCalledTimes(1);
      expect(useSessionStore.getState().voiceSessionStatus).toBe('ready');
      expect(useSessionStore.getState().screenCaptureState).toBe('streaming');
    });
  });

  it('stops screen capture automatically when the session ends', async () => {
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
    expect(useSessionStore.getState().screenCaptureState).toBe('capturing');

    await controller.endSession();

    expect(screenCapture.stop).toHaveBeenCalledOnce();
    expect(useSessionStore.getState().screenCaptureState).toBe('disabled');
    expect(useSessionStore.getState().voiceSessionStatus).toBe('disconnected');
  });

  it('maps screen capture permission error to error state without breaking voice session', async () => {
    const voiceTransport = createVoiceTransportHarness();
    const screenCapture = createScreenCaptureHarness();
    screenCapture.start.mockRejectedValueOnce(
      Object.assign(new Error('Screen capture permission was denied'), { name: 'NotAllowedError' }),
    );
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

    expect(useSessionStore.getState().screenCaptureState).toBe('error');
    expect(useSessionStore.getState().voiceSessionStatus).toBe('ready');
  });

  it('captures ready and streaming diagnostics independently from voice audio state', async () => {
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

    expect(useSessionStore.getState().screenCaptureState).toBe('capturing');
    screenCapture.emitDiagnostics({
      captureSource: 'Entire screen',
      lastFrameAt: '2026-03-10T00:00:00.000Z',
    });
    controller.analyzeScreenNow();
    screenCapture.emitFrame();

    await vi.waitFor(() => {
      expect(useSessionStore.getState()).toEqual(
        expect.objectContaining({
          voiceSessionStatus: 'ready',
          screenCaptureState: 'streaming',
          screenCaptureDiagnostics: expect.objectContaining({
            captureSource: 'Entire screen',
            lastFrameAt: '2026-03-10T00:00:00.000Z',
            lastUploadStatus: 'sent',
          }),
        }),
      );
    });
  });

  it('maps screen frame upload failures into screen-context error state without disconnecting voice', async () => {
    const voiceTransport = createVoiceTransportHarness();
    voiceTransport.sendVideoFrame.mockRejectedValueOnce(new Error('frame upload failed'));
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
    controller.analyzeScreenNow();
    screenCapture.emitFrame();

    await vi.waitFor(() => {
      expect(screenCapture.stop).toHaveBeenCalledOnce();
      expect(useSessionStore.getState().voiceSessionStatus).toBe('ready');
      expect(useSessionStore.getState().screenCaptureState).toBe('error');
      expect(useSessionStore.getState().screenCaptureDiagnostics.lastUploadStatus).toBe('error');
      expect(useSessionStore.getState().screenCaptureDiagnostics.lastError).toBe(
        'frame upload failed',
      );
    });
  });

  it('keeps the speech session usable after screen upload failures', async () => {
    const voiceTransport = createVoiceTransportHarness();
    voiceTransport.sendVideoFrame.mockRejectedValueOnce(new Error('frame upload failed'));
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
    controller.analyzeScreenNow();
    screenCapture.emitFrame();

    await vi.waitFor(() => {
      expect(useSessionStore.getState().screenCaptureState).toBe('error');
    });

    await expect(controller.submitTextTurn('screen toggle recovery check')).resolves.toBe(true);
    expect(voiceTransport.sendText).toHaveBeenCalledWith('screen toggle recovery check');
    expect(useSessionStore.getState().voiceSessionStatus).toBe('ready');
  });

  it('stops screen capture when the active Live runtime is replaced during resume', async () => {
    const firstTransport = createVoiceTransportHarness();
    const resumedTransport = createVoiceTransportHarness();
    const screenCapture = createScreenCaptureHarness();
    const controller = createDesktopSessionController({
      logger: { onSessionEvent: vi.fn(), onTransportEvent: vi.fn() },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi
        .fn()
        .mockReturnValueOnce(firstTransport.transport)
        .mockReturnValueOnce(resumedTransport.transport),
      createScreenCapture: screenCapture.createScreenCapture,
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'speech' });
    await controller.startScreenCapture();

    firstTransport.emit({
      type: 'session-resumption-update',
      handle: 'handles/voice-session-2',
      resumable: true,
    });
    firstTransport.emit({
      type: 'go-away',
      detail: 'server draining',
    });

    await vi.waitFor(() => {
      expect(screenCapture.stop).toHaveBeenCalledOnce();
      expect(resumedTransport.connect).toHaveBeenCalledWith({
        token: {
          token: 'auth_tokens/test-token',
          expireTime: '2099-03-09T12:30:00.000Z',
          newSessionExpireTime: '2099-03-09T12:01:30.000Z',
        },
        mode: 'voice',
        resumeHandle: 'handles/voice-session-2',
      });
      expect(useSessionStore.getState().screenCaptureState).toBe('disabled');
    });
  });

  it('keeps screen capture disabled after fallback replaces the active Live runtime until manually re-enabled', async () => {
    const firstTransport = createVoiceTransportHarness();
    const fallbackTransport = createVoiceTransportHarness();
    const screenCapture = createScreenCaptureHarness();
    const controller = createDesktopSessionController({
      logger: { onSessionEvent: vi.fn(), onTransportEvent: vi.fn() },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi
        .fn()
        .mockReturnValueOnce(firstTransport.transport)
        .mockReturnValueOnce(fallbackTransport.transport),
      createScreenCapture: screenCapture.createScreenCapture,
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'speech' });
    await controller.startScreenCapture();

    firstTransport.emit({
      type: 'session-resumption-update',
      handle: null,
      resumable: false,
      detail: 'Gemini Live session is not resumable at this point',
    });
    firstTransport.emit({
      type: 'connection-terminated',
      detail: 'transport recycled',
    });

    await vi.waitFor(() => {
      expect(screenCapture.stop).toHaveBeenCalledOnce();
      expect(fallbackTransport.connect).toHaveBeenCalledWith({
        token: {
          token: 'auth_tokens/test-token',
          expireTime: '2099-03-09T12:30:00.000Z',
          newSessionExpireTime: '2099-03-09T12:01:30.000Z',
        },
        mode: 'voice',
        rehydrationPacket: expect.any(Object),
      });
      expect(useSessionStore.getState().screenCaptureState).toBe('disabled');
    });

    await controller.startScreenCapture();
    controller.analyzeScreenNow();
    screenCapture.emitFrame({ sequence: 2 });

    await vi.waitFor(() => {
      expect(screenCapture.start).toHaveBeenCalledTimes(2);
      expect(fallbackTransport.sendVideoFrame).toHaveBeenCalledWith(
        new Uint8Array([1, 2, 3]),
        'image/jpeg',
      );
      expect(useSessionStore.getState().screenCaptureState).toBe('streaming');
    });
  });

  it('does not persist raw screen frames into canonical chat memory', async () => {
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
    controller.analyzeScreenNow();
    screenCapture.emitFrame();

    await vi.waitFor(() => {
      expect(voiceTransport.sendVideoFrame).toHaveBeenCalledTimes(1);
    });

    expect(window.bridge.appendChatMessage).not.toHaveBeenCalled();
    expect(useSessionStore.getState().conversationTurns).toEqual([]);
  });

  it('does not send frames via transport after stopScreenCapture', async () => {
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
    await controller.stopScreenCapture();

    screenCapture.emitFrame();
    await Promise.resolve();

    expect(voiceTransport.sendVideoFrame).not.toHaveBeenCalled();
  });
});
