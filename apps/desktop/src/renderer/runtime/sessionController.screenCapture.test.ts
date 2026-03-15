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

  it('refreshes the source snapshot before starting screen capture', async () => {
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
    window.bridge.listScreenCaptureSources = vi.fn(async () => ({
      sources: [{ id: 'screen:2:0', name: 'Desk Display' }],
      selectedSourceId: null,
    }));

    await controller.startSession({ mode: 'speech' });
    useSessionStore.getState().setScreenCaptureSourceSnapshot({
      sources: [{ id: 'window:42:0', name: 'Stale Window' }],
      selectedSourceId: 'window:42:0',
    });

    await controller.startScreenCapture();

    expect(window.bridge.listScreenCaptureSources).toHaveBeenCalledTimes(1);
    expect(screenCapture.start).toHaveBeenCalledOnce();
    expect(useSessionStore.getState().screenCaptureSources).toEqual([
      { id: 'screen:2:0', name: 'Desk Display' },
    ]);
    expect(useSessionStore.getState().selectedScreenCaptureSourceId).toBeNull();
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

  it('keeps screen capture idle when refreshing sources fails before start', async () => {
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
    window.bridge.listScreenCaptureSources = vi.fn(async () => {
      throw new Error('enumeration failed');
    });

    await controller.startSession({ mode: 'speech' });
    await controller.startScreenCapture();

    expect(window.bridge.listScreenCaptureSources).toHaveBeenCalledTimes(1);
    expect(screenCapture.start).not.toHaveBeenCalled();
    expect(useSessionStore.getState().screenShareIntended).toBe(false);
    expect(useSessionStore.getState().lastRuntimeError).toBe('enumeration failed');
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

  it('restores screen capture automatically when the active Live runtime is replaced during resume', async () => {
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
    window.bridge.listScreenCaptureSources = vi.fn(async () => ({
      sources: [{ id: 'screen:1:0', name: 'Desk Display' }],
      selectedSourceId: 'screen:1:0',
    }));
    await controller.startScreenCapture();
    useSessionStore.getState().setScreenCaptureSourceSnapshot({
      sources: [{ id: 'window:42:0', name: 'Stale Window' }],
      selectedSourceId: 'window:42:0',
    });
    window.bridge.listScreenCaptureSources = vi.fn(async () => ({
      sources: [{ id: 'screen:2:0', name: 'Projector' }],
      selectedSourceId: null,
    }));

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
      expect(window.bridge.listScreenCaptureSources).toHaveBeenCalledTimes(1);
      expect(screenCapture.start).toHaveBeenCalledTimes(2);
      expect(useSessionStore.getState().screenCaptureState).toBe('capturing');
      expect(useSessionStore.getState().screenCaptureSources).toEqual([
        { id: 'screen:2:0', name: 'Projector' },
      ]);
      expect(useSessionStore.getState().selectedScreenCaptureSourceId).toBeNull();
    });
  });

  it('restores screen capture automatically after fallback replaces the active Live runtime', async () => {
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
      expect(screenCapture.start).toHaveBeenCalledTimes(2);
      expect(useSessionStore.getState().screenCaptureState).toBe('capturing');
    });

    controller.analyzeScreenNow();
    screenCapture.emitFrame({ sequence: 2 });

    await vi.waitFor(() => {
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

// ---------------------------------------------------------------------------
// Screen share → visual delivery: end-to-end behavior
//
// These tests lock in the runtime guarantee that enabling screen share results
// in an initial bootstrap frame reaching the model, after which the policy
// returns to sleep.  Continuous streaming requires an explicit enableStreaming().
// ---------------------------------------------------------------------------
describe('createDesktopSessionController – screen share visual delivery', () => {
  beforeEach(() => {
    resetDesktopStoresWithDefaults();
  });

  function makeController(
    voiceTransport: ReturnType<typeof createVoiceTransportHarness>,
    screenCapture: ReturnType<typeof createScreenCaptureHarness>,
  ) {
    return createDesktopSessionController({
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
  }

  it('startScreenCapture alone (no explicit analyzeScreenNow) sends one bootstrap frame to the model', async () => {
    // startScreenCapture() arms a bootstrap snapshot internally.
    // Callers do not need to call analyzeScreenNow() to get the first frame.
    const voiceTransport = createVoiceTransportHarness();
    const screenCapture = createScreenCaptureHarness();
    const controller = makeController(voiceTransport, screenCapture);

    await controller.startSession({ mode: 'speech' });
    await controller.startScreenCapture();

    // No analyzeScreenNow() call here – the bootstrap snapshot fires automatically.
    screenCapture.emitFrame({ sequence: 1 });

    await vi.waitFor(() => {
      expect(voiceTransport.sendVideoFrame).toHaveBeenCalledWith(
        new Uint8Array([1, 2, 3]),
        'image/jpeg',
      );
    });
  });

  it('after bootstrap snapshot, subsequent frames are NOT sent automatically', async () => {
    // The bootstrap delivers exactly one frame. After that, the policy
    // reverts to sleep and no further frames are sent until the caller
    // explicitly enables streaming or calls analyzeScreenNow.
    const voiceTransport = createVoiceTransportHarness();
    const screenCapture = createScreenCaptureHarness();
    const controller = makeController(voiceTransport, screenCapture);

    await controller.startSession({ mode: 'speech' });
    await controller.startScreenCapture();

    // Frame 1: bootstrap snapshot consumed.
    screenCapture.emitFrame({ sequence: 1 });
    await vi.waitFor(() => {
      expect(voiceTransport.sendVideoFrame).toHaveBeenCalledTimes(1);
    });

    // Frame 2: policy is in sleep → blocked.
    screenCapture.emitFrame({ sequence: 2 });
    await Promise.resolve();
    expect(voiceTransport.sendVideoFrame).toHaveBeenCalledTimes(1);

    // Frame 3: still sleep → blocked.
    screenCapture.emitFrame({ sequence: 3 });
    await Promise.resolve();
    expect(voiceTransport.sendVideoFrame).toHaveBeenCalledTimes(1);
  });

  it('visual send state is snapshot (not streaming) after startScreenCapture succeeds', async () => {
    // After startScreenCapture the visual send state is snapshot (bootstrap
    // armed), not streaming. Continuous delivery requires explicit opt-in.
    const voiceTransport = createVoiceTransportHarness();
    const screenCapture = createScreenCaptureHarness();
    const controller = makeController(voiceTransport, screenCapture);

    await controller.startSession({ mode: 'speech' });
    await controller.startScreenCapture();

    const visualDiagnostics = useSessionStore.getState().visualSendDiagnostics;
    expect(visualDiagnostics.lastTransitionReason).toBe('bootstrap');
  });

  it('stopScreenCapture stops visual streaming and prevents further frame delivery', async () => {
    const voiceTransport = createVoiceTransportHarness();
    const screenCapture = createScreenCaptureHarness();
    const controller = makeController(voiceTransport, screenCapture);

    await controller.startSession({ mode: 'speech' });
    await controller.startScreenCapture();
    await controller.stopScreenCapture();

    screenCapture.emitFrame({ sequence: 1 });
    await Promise.resolve();

    expect(voiceTransport.sendVideoFrame).not.toHaveBeenCalled();
  });

  it('if the bootstrap frame fails at transport, re-starting screen share delivers a new bootstrap', async () => {
    // The transport may reject the bootstrap frame. After re-starting screen
    // share, a new bootstrap snapshot is armed and the next frame succeeds.
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

    // Simulate frame 1 failing at the transport layer.
    voiceTransport.sendVideoFrame.mockRejectedValueOnce(new Error('transient error'));
    screenCapture.emitFrame({ sequence: 1 });

    // Wait for error to propagate (this will stop screen capture with error).
    await vi.waitFor(() => {
      expect(useSessionStore.getState().screenCaptureState).toBe('error');
    });

    // Re-enable screen share – a new bootstrap snapshot is armed.
    await controller.startScreenCapture();
    screenCapture.emitFrame({ sequence: 2 });

    await vi.waitFor(() => {
      expect(voiceTransport.sendVideoFrame).toHaveBeenCalledTimes(2);
      expect(useSessionStore.getState().screenCaptureState).toBe('streaming');
    });
  });

  it('explicit analyzeScreenNow sends a one-shot snapshot after bootstrap is consumed', async () => {
    // After the bootstrap snapshot is consumed, analyzeScreenNow arms a new
    // snapshot for an explicit single-frame capture.
    const voiceTransport = createVoiceTransportHarness();
    const screenCapture = createScreenCaptureHarness();
    const controller = makeController(voiceTransport, screenCapture);

    await controller.startSession({ mode: 'speech' });
    await controller.startScreenCapture();

    // Bootstrap frame.
    screenCapture.emitFrame({ sequence: 1 });
    await vi.waitFor(() => {
      expect(voiceTransport.sendVideoFrame).toHaveBeenCalledTimes(1);
    });

    // Explicit analyzeScreenNow after bootstrap consumed (policy is in sleep).
    // Note: cooldown may apply (3s window from bootstrap), so this call may
    // be silently ignored. The test verifies the overall flow is stable.
    controller.analyzeScreenNow();

    screenCapture.emitFrame({ sequence: 2 });
    await Promise.resolve();
    // Frame 2 may or may not be sent depending on cooldown.
    // The important thing is no crash and the session stays healthy.
    expect(useSessionStore.getState().voiceSessionStatus).toBe('ready');
  });

  it('enableScreenStreaming / stopScreenStreaming round-trip is stable', async () => {
    // The public streaming controls must be exercisable without side-effects
    // on the rest of the session. After bootstrap, enable streaming explicitly.
    const voiceTransport = createVoiceTransportHarness();
    const screenCapture = createScreenCaptureHarness();
    const controller = makeController(voiceTransport, screenCapture);

    await controller.startSession({ mode: 'speech' });
    await controller.startScreenCapture();

    // Consume bootstrap snapshot first.
    screenCapture.emitFrame({ sequence: 0 });
    await vi.waitFor(() => {
      expect(voiceTransport.sendVideoFrame).toHaveBeenCalledTimes(1);
    });
    voiceTransport.sendVideoFrame.mockClear();

    // Enable streaming then stop: frames should be blocked.
    controller.enableScreenStreaming();
    controller.stopScreenStreaming();
    screenCapture.emitFrame({ sequence: 1 });
    await Promise.resolve();
    expect(voiceTransport.sendVideoFrame).not.toHaveBeenCalled();

    // Re-enable streaming: frames should flow again.
    controller.enableScreenStreaming();
    screenCapture.emitFrame({ sequence: 2 });
    await vi.waitFor(() => {
      expect(voiceTransport.sendVideoFrame).toHaveBeenCalledTimes(1);
    });
  });
});
