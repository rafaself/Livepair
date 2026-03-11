import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDesktopSessionController } from './sessionController';
import { useSessionStore } from '../store/sessionStore';
import { useSettingsStore } from '../store/settingsStore';
import { DEFAULT_DESKTOP_SETTINGS } from '../../shared/settings';
import {
  createVoiceTransportHarness,
  createVoiceCaptureHarness,
  createVoicePlaybackHarness,
  createTextChatHarness,
} from './sessionController.testUtils';

describe('createDesktopSessionController – interruption', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
    useSettingsStore.setState({
      settings: DEFAULT_DESKTOP_SETTINGS,
      isReady: true,
    });
  });

  it('handles interruption during active playback without disconnecting the voice session', async () => {
    const voiceTransport = createVoiceTransportHarness();
    const voicePlayback = createVoicePlaybackHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn(),
      startTextChatStream: createTextChatHarness().startTextChatStream,
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn(() => voiceTransport.transport),
      createVoicePlayback: voicePlayback.createVoicePlayback,
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });
    voiceTransport.emit({ type: 'audio-chunk', chunk: new Uint8Array([1, 2, 3, 4]) });
    voicePlayback.emitState('playing');
    voicePlayback.emitDiagnostics({
      chunkCount: 2,
      queueDepth: 2,
      sampleRateHz: 24_000,
      selectedOutputDeviceId: 'default',
      lastError: null,
    });
    await Promise.resolve();

    voiceTransport.emit({ type: 'interrupted' });

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        currentMode: 'speech',
        voiceSessionStatus: 'interrupted',
        speechLifecycle: expect.objectContaining({
          status: 'interrupted',
        }),
        assistantActivity: 'idle',
        activeTransport: 'gemini-live',
        lastRuntimeError: null,
        textSessionLifecycle: expect.objectContaining({ status: 'disconnected' }),
      }),
    );
    expect(voicePlayback.stop).toHaveBeenCalledTimes(1);
    expect(voiceTransport.disconnect).not.toHaveBeenCalled();

    voicePlayback.resolveStop();
    await Promise.resolve();
    await Promise.resolve();

    await vi.waitFor(() => {
      expect(useSessionStore.getState()).toEqual(
        expect.objectContaining({
          voiceSessionStatus: 'recovering',
          voicePlaybackState: 'stopped',
          activeTransport: 'gemini-live',
        }),
      );
    });
    expect(useSessionStore.getState().voicePlaybackDiagnostics).toEqual(
      expect.objectContaining({
        queueDepth: 0,
      }),
    );
  });

  it('handles interruption while buffering, keeps capture active, and resumes streaming on the next mic chunk', async () => {
    const voiceCapture = createVoiceCaptureHarness();
    const voiceTransport = createVoiceTransportHarness();
    const voicePlayback = createVoicePlaybackHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      startTextChatStream: createTextChatHarness().startTextChatStream,
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn(() => voiceTransport.transport),
      createVoiceCapture: voiceCapture.createVoiceCapture,
      createVoicePlayback: voicePlayback.createVoicePlayback,
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });
    await controller.startVoiceCapture();
    voicePlayback.enableDeferredStop();
    voiceTransport.emit({ type: 'audio-chunk', chunk: new Uint8Array([1, 2, 3, 4]) });
    voicePlayback.emitState('buffering');
    voicePlayback.emitDiagnostics({
      chunkCount: 1,
      queueDepth: 1,
      sampleRateHz: 24_000,
      selectedOutputDeviceId: 'default',
      lastError: null,
    });
    await Promise.resolve();

    voiceTransport.emit({ type: 'interrupted' });

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        voiceSessionStatus: 'interrupted',
        voiceCaptureState: 'capturing',
        assistantActivity: 'idle',
      }),
    );

    voicePlayback.resolveStop();
    await vi.waitFor(() => {
      expect(useSessionStore.getState()).toEqual(
        expect.objectContaining({
          voiceSessionStatus: 'recovering',
          voicePlaybackState: 'stopped',
        }),
      );
    });
    expect(useSessionStore.getState().voicePlaybackDiagnostics).toEqual(
      expect.objectContaining({
        queueDepth: 0,
      }),
    );

    voiceCapture.emitChunk({
      data: new Uint8Array(640).fill(2),
      sequence: 2,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(voiceTransport.sendAudioChunk).toHaveBeenLastCalledWith(
      new Uint8Array(640).fill(2),
    );
    expect(useSessionStore.getState().voiceSessionStatus).toBe('streaming');
  });

  it('treats repeated interruption events as safe and idempotent', async () => {
    const voiceTransport = createVoiceTransportHarness();
    const voicePlayback = createVoicePlaybackHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn(),
      startTextChatStream: createTextChatHarness().startTextChatStream,
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn(() => voiceTransport.transport),
      createVoicePlayback: voicePlayback.createVoicePlayback,
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });
    voicePlayback.enableDeferredStop();
    voiceTransport.emit({ type: 'audio-chunk', chunk: new Uint8Array([1, 2, 3, 4]) });
    voicePlayback.emitState('playing');
    await Promise.resolve();

    voiceTransport.emit({ type: 'interrupted' });
    voiceTransport.emit({ type: 'interrupted' });

    expect(voicePlayback.stop).toHaveBeenCalledTimes(1);

    voicePlayback.resolveStop();
    await vi.waitFor(() => {
      expect(useSessionStore.getState()).toEqual(
        expect.objectContaining({
          voiceSessionStatus: 'recovering',
          voicePlaybackState: 'stopped',
          activeTransport: 'gemini-live',
        }),
      );
    });
  });
});
