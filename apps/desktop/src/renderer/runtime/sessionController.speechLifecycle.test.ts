import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDesktopSessionController } from './sessionController';
import { useSessionStore } from '../store/sessionStore';
import { useSettingsStore } from '../store/settingsStore';
import { DEFAULT_DESKTOP_SETTINGS } from '../../shared/settings';
import {
  createVoiceTransportHarness,
  createVoiceCaptureHarness,
  createVoicePlaybackHarness,
} from './sessionController.testUtils';

describe('createDesktopSessionController – speech lifecycle', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
    useSettingsStore.setState({
      settings: DEFAULT_DESKTOP_SETTINGS,
      isReady: true,
    });
  });

  it('moves the speech lifecycle through user speaking, assistant speaking, interruption, recovery, and listening', async () => {
    vi.useFakeTimers();

    const voiceCapture = createVoiceCaptureHarness();
    const voiceTransport = createVoiceTransportHarness();
    const voicePlayback = createVoicePlaybackHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn(),
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

    await controller.startSession({ mode: 'speech' });

    voiceTransport.emit({ type: 'input-transcript', text: 'hello' });
    expect(useSessionStore.getState().speechLifecycle.status).toBe('userSpeaking');

    voiceTransport.emit({ type: 'output-transcript', text: 'hi there' });
    expect(useSessionStore.getState().speechLifecycle.status).toBe('assistantSpeaking');

    voicePlayback.enableDeferredStop();
    voiceTransport.emit({ type: 'audio-chunk', chunk: new Uint8Array([1, 2, 3, 4]) });
    voiceTransport.emit({ type: 'interrupted' });
    expect(useSessionStore.getState().speechLifecycle.status).toBe('interrupted');

    voicePlayback.resolveStop();
    await vi.waitFor(() => {
      expect(['recovering', 'listening']).toContain(
        useSessionStore.getState().speechLifecycle.status,
      );
    });

    await vi.runAllTimersAsync();
    expect(useSessionStore.getState().speechLifecycle.status).toBe('listening');

    vi.useRealTimers();
  });

  it('does not auto-end speech mode when the silence timeout is never', async () => {
    vi.useFakeTimers();
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_DESKTOP_SETTINGS,
        speechSilenceTimeout: 'never',
      },
      isReady: true,
    });
    const voiceCapture = createVoiceCaptureHarness();
    const voiceTransport = createVoiceTransportHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn(),
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
    await vi.advanceTimersByTimeAsync(5 * 60_000);

    expect(useSessionStore.getState().speechLifecycle.status).toBe('listening');
    expect(useSessionStore.getState().currentMode).toBe('speech');

    vi.useRealTimers();
  });

  it('ends speech mode through controlled shutdown after the configured silence timeout', async () => {
    vi.useFakeTimers();
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_DESKTOP_SETTINGS,
        speechSilenceTimeout: '30s',
      },
      isReady: true,
    });
    const voiceCapture = createVoiceCaptureHarness();
    const voiceTransport = createVoiceTransportHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn(),
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
    await vi.advanceTimersByTimeAsync(30_000);

    expect(voiceCapture.stop).toHaveBeenCalledTimes(1);
    expect(voiceTransport.disconnect).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().speechLifecycle.status).toBe('off');
    expect(useSessionStore.getState().currentMode).toBe('inactive');

    vi.useRealTimers();
  });

  it('resets the speech silence timeout on user speech, typed input, and assistant speaking', async () => {
    vi.useFakeTimers();
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_DESKTOP_SETTINGS,
        speechSilenceTimeout: '3m',
      },
      isReady: true,
    });
    const voiceCapture = createVoiceCaptureHarness();
    const voiceTransport = createVoiceTransportHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn(),
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

    await vi.advanceTimersByTimeAsync(179_000);
    voiceTransport.emit({ type: 'input-transcript', text: 'still here' });
    await vi.advanceTimersByTimeAsync(179_000);
    await controller.submitTextTurn('typed reset');
    await vi.advanceTimersByTimeAsync(179_000);
    voiceTransport.emit({ type: 'output-transcript', text: 'assistant reset' });
    voiceTransport.emit({ type: 'turn-complete' });
    await vi.advanceTimersByTimeAsync(179_000);

    expect(useSessionStore.getState().speechLifecycle.status).toBe('listening');
    expect(useSessionStore.getState().currentMode).toBe('speech');

    await vi.advanceTimersByTimeAsync(1_000);
    expect(useSessionStore.getState().speechLifecycle.status).toBe('off');

    vi.useRealTimers();
  });
});
