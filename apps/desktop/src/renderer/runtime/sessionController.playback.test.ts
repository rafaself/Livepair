import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDesktopSessionController } from './sessionController';
import { useSessionStore } from '../store/sessionStore';
import { useSettingsStore } from '../store/settingsStore';
import { DEFAULT_DESKTOP_SETTINGS } from '../../shared/settings';
import {
  createVoiceTransportHarness,
  createVoicePlaybackHarness,
} from './sessionController.testUtils';

describe('createDesktopSessionController – playback', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
    useSettingsStore.setState({
      settings: DEFAULT_DESKTOP_SETTINGS,
      isReady: true,
    });
  });

  it('routes assistant audio chunks into playback state and diagnostics without affecting text mode', async () => {
    const voiceTransport = createVoiceTransportHarness();
    const voicePlayback = createVoicePlaybackHarness();
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_DESKTOP_SETTINGS,
        selectedOutputDeviceId: 'desk-speakers',
      },
      isReady: true,
    });
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
      createVoicePlayback: voicePlayback.createVoicePlayback,
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });
    voicePlayback.enableDeferredStop();
    voiceTransport.emit({ type: 'audio-chunk', chunk: new Uint8Array([1, 2, 3, 4]) });
    voicePlayback.emitState('playing');
    voicePlayback.emitDiagnostics({
      chunkCount: 1,
      queueDepth: 1,
      sampleRateHz: 24_000,
      selectedOutputDeviceId: 'desk-speakers',
      lastError: null,
    });

    expect(voicePlayback.createVoicePlayback).toHaveBeenCalledWith(
      expect.objectContaining({
        onStateChange: expect.any(Function),
      }),
      expect.objectContaining({
        selectedOutputDeviceId: 'desk-speakers',
      }),
    );
    expect(voicePlayback.enqueue).toHaveBeenCalledWith(new Uint8Array([1, 2, 3, 4]));
    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        currentMode: 'speech',
        voicePlaybackState: 'playing',
        assistantActivity: 'speaking',
        textSessionLifecycle: expect.objectContaining({ status: 'disconnected' }),
      }),
    );
    expect(useSessionStore.getState().voicePlaybackDiagnostics).toEqual(
      expect.objectContaining({
        chunkCount: 1,
        queueDepth: 1,
        sampleRateHz: 24_000,
        selectedOutputDeviceId: 'desk-speakers',
        lastError: null,
      }),
    );
  });

  it('stops assistant playback on disconnect and transport error without changing text mode', async () => {
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
      createVoicePlayback: voicePlayback.createVoicePlayback,
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });
    voiceTransport.emit({ type: 'audio-chunk', chunk: new Uint8Array([1, 2, 3, 4]) });
    await Promise.resolve();

    voiceTransport.emit({ type: 'connection-state-changed', state: 'disconnected' });
    await Promise.resolve();

    expect(voicePlayback.stop).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        currentMode: 'speech',
        voicePlaybackState: 'stopped',
        voiceSessionStatus: 'disconnected',
        textSessionLifecycle: expect.objectContaining({ status: 'disconnected' }),
      }),
    );

    await controller.startSession({ mode: 'voice' });
    voiceTransport.emit({ type: 'audio-chunk', chunk: new Uint8Array([5, 6, 7, 8]) });
    voicePlayback.emitState('playing');
    voiceTransport.emit({ type: 'error', detail: 'transport failed' });
    await Promise.resolve();

    await vi.waitFor(() => {
      expect(useSessionStore.getState()).toEqual(
        expect.objectContaining({
          currentMode: 'inactive',
          speechLifecycle: expect.objectContaining({
            status: 'off',
          }),
          voicePlaybackState: 'stopped',
          voiceSessionStatus: 'disconnected',
          lastRuntimeError: 'transport failed',
        }),
      );
    });
  });

  it('surfaces malformed assistant audio as a playback-only error and keeps the voice session connected', async () => {
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
      createVoicePlayback: voicePlayback.createVoicePlayback,
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });
    voiceTransport.emit({ type: 'audio-chunk', chunk: new Uint8Array([1, 2, 3, 4]) });
    await Promise.resolve();
    voiceTransport.emit({
      type: 'audio-error',
      detail: 'Assistant audio payload was malformed',
    });
    await Promise.resolve();

    expect(voicePlayback.stop).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        activeTransport: 'gemini-live',
        voiceSessionStatus: 'ready',
        voicePlaybackState: 'error',
        lastRuntimeError: 'Assistant audio payload was malformed',
      }),
    );
  });
});
