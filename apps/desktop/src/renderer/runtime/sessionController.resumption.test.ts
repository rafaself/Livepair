import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDesktopSessionController } from './sessionController';
import { useSessionStore } from '../store/sessionStore';
import { useSettingsStore } from '../store/settingsStore';
import { DEFAULT_DESKTOP_SETTINGS } from '../../shared/settings';
import {
  createUnusedTransport,
  createVoiceTransportHarness,
  expectDefaultResumptionState,
} from './sessionController.testUtils';

describe('createDesktopSessionController – resumption', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
    useSettingsStore.setState({
      settings: DEFAULT_DESKTOP_SETTINGS,
      isReady: true,
    });
  });

  it('stores the latest resumption handle and resumes after go-away with the existing token when still valid', async () => {
    const firstTransport = createVoiceTransportHarness();
    const resumedTransport = createVoiceTransportHarness();
    const requestSessionToken = vi.fn().mockResolvedValue({
      token: 'auth_tokens/test-token',
      expireTime: '2099-03-09T12:30:00.000Z',
      newSessionExpireTime: '2099-03-09T12:01:30.000Z',
    });
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn(),
      requestSessionToken,
      createTransport: vi
        .fn()
        .mockReturnValueOnce(firstTransport.transport)
        .mockReturnValueOnce(resumedTransport.transport),
    });

    await controller.startSession({ mode: 'voice' });

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
      expect(resumedTransport.connect).toHaveBeenCalledWith({
        token: {
          token: 'auth_tokens/test-token',
          expireTime: '2099-03-09T12:30:00.000Z',
          newSessionExpireTime: '2099-03-09T12:01:30.000Z',
        },
        mode: 'voice',
        resumeHandle: 'handles/voice-session-2',
      });
    });

    expect(requestSessionToken).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().voiceSessionResumption).toEqual({
      status: 'resumed',
      latestHandle: 'handles/voice-session-2',
      resumable: true,
      lastDetail: 'server draining',
    });
    expect(useSessionStore.getState().voiceSessionDurability).toEqual(
      expect.objectContaining({
        tokenValid: true,
        tokenRefreshing: false,
        tokenRefreshFailed: false,
      }),
    );
  });

  it('refreshes the token before resume when the existing token is near expiry', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-09T12:00:00.000Z'));

    const firstTransport = createVoiceTransportHarness();
    const resumedTransport = createVoiceTransportHarness();
    const requestSessionToken = vi
      .fn()
      .mockResolvedValueOnce({
        token: 'auth_tokens/near-expiry-token',
        expireTime: '2026-03-09T12:00:30.000Z',
        newSessionExpireTime: '2026-03-09T12:00:20.000Z',
      })
      .mockResolvedValueOnce({
        token: 'auth_tokens/refreshed-token',
        expireTime: '2026-03-09T12:31:30.000Z',
        newSessionExpireTime: '2026-03-09T12:01:30.000Z',
      });
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn(),
      requestSessionToken,
      createTransport: vi
        .fn()
        .mockReturnValueOnce(firstTransport.transport)
        .mockReturnValueOnce(resumedTransport.transport),
    });

    await controller.startSession({ mode: 'voice' });

    firstTransport.emit({
      type: 'session-resumption-update',
      handle: 'handles/voice-session-2',
      resumable: true,
    });
    firstTransport.emit({
      type: 'connection-terminated',
      detail: 'transport recycled',
    });

    await vi.waitFor(() => {
      expect(resumedTransport.connect).toHaveBeenCalledWith({
        token: {
          token: 'auth_tokens/refreshed-token',
          expireTime: '2026-03-09T12:31:30.000Z',
          newSessionExpireTime: '2026-03-09T12:01:30.000Z',
        },
        mode: 'voice',
        resumeHandle: 'handles/voice-session-2',
      });
    });

    expect(requestSessionToken).toHaveBeenCalledTimes(2);
    expect(useSessionStore.getState().voiceSessionDurability).toEqual({
      compressionEnabled: true,
      tokenValid: true,
      tokenRefreshing: false,
      tokenRefreshFailed: false,
      expireTime: '2026-03-09T12:31:30.000Z',
      newSessionExpireTime: '2026-03-09T12:01:30.000Z',
      lastDetail: 'transport recycled',
    });

    vi.useRealTimers();
  });

  it('handles token refresh failure explicitly when resume needs a new token', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-09T12:00:00.000Z'));

    const firstTransport = createVoiceTransportHarness();
    const requestSessionToken = vi
      .fn()
      .mockResolvedValueOnce({
        token: 'auth_tokens/near-expiry-token',
        expireTime: '2026-03-09T12:00:30.000Z',
        newSessionExpireTime: '2026-03-09T12:00:20.000Z',
      })
      .mockRejectedValueOnce(new Error('token refresh failed'));
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn(),
      requestSessionToken,
      createTransport: vi.fn(() => firstTransport.transport),
    });

    await controller.startSession({ mode: 'voice' });

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
      expect(useSessionStore.getState().speechLifecycle.status).toBe('off');
    });

    expect(useSessionStore.getState().voiceSessionResumption).toEqual({
      status: 'resumeFailed',
      latestHandle: 'handles/voice-session-2',
      resumable: false,
      lastDetail: 'token refresh failed',
    });
    expect(useSessionStore.getState().voiceSessionDurability).toEqual({
      compressionEnabled: true,
      tokenValid: false,
      tokenRefreshing: false,
      tokenRefreshFailed: true,
      expireTime: '2026-03-09T12:00:30.000Z',
      newSessionExpireTime: '2026-03-09T12:00:20.000Z',
      lastDetail: 'token refresh failed',
    });
    expect(useSessionStore.getState().currentMode).toBe('inactive');
    expect(useSessionStore.getState().voiceSessionStatus).toBe('disconnected');
    expect(useSessionStore.getState().lastRuntimeError).toBe('token refresh failed');

    vi.useRealTimers();
  });

  it('handles resume failure after a successful token refresh', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-09T12:00:00.000Z'));

    const firstTransport = createVoiceTransportHarness();
    const resumedTransport = createVoiceTransportHarness();
    resumedTransport.setConnectError(new Error('resume rejected'));
    const requestSessionToken = vi
      .fn()
      .mockResolvedValueOnce({
        token: 'auth_tokens/near-expiry-token',
        expireTime: '2026-03-09T12:00:30.000Z',
        newSessionExpireTime: '2026-03-09T12:00:20.000Z',
      })
      .mockResolvedValueOnce({
        token: 'auth_tokens/refreshed-token',
        expireTime: '2026-03-09T12:31:30.000Z',
        newSessionExpireTime: '2026-03-09T12:01:30.000Z',
      });
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn(),
      requestSessionToken,
      createTransport: vi
        .fn()
        .mockReturnValueOnce(firstTransport.transport)
        .mockReturnValueOnce(resumedTransport.transport),
    });

    await controller.startSession({ mode: 'voice' });

    firstTransport.emit({
      type: 'session-resumption-update',
      handle: 'handles/voice-session-2',
      resumable: true,
    });
    firstTransport.emit({
      type: 'connection-terminated',
      detail: 'transport recycled',
    });

    await vi.waitFor(() => {
      expect(useSessionStore.getState().speechLifecycle.status).toBe('off');
    });

    expect(useSessionStore.getState().voiceSessionResumption).toEqual({
      status: 'resumeFailed',
      latestHandle: 'handles/voice-session-2',
      resumable: false,
      lastDetail: 'resume rejected',
    });
    expect(useSessionStore.getState().voiceSessionDurability).toEqual({
      compressionEnabled: true,
      tokenValid: true,
      tokenRefreshing: false,
      tokenRefreshFailed: false,
      expireTime: '2026-03-09T12:31:30.000Z',
      newSessionExpireTime: '2026-03-09T12:01:30.000Z',
      lastDetail: 'resume rejected',
    });
    expect(useSessionStore.getState().currentMode).toBe('inactive');
    expect(useSessionStore.getState().voiceSessionStatus).toBe('disconnected');
    expect(useSessionStore.getState().lastRuntimeError).toBe('resume rejected');

    vi.useRealTimers();
  });

  it('stores the latest resumption handle and reconnects after go-away without requesting a new token', async () => {
    const firstTransport = createVoiceTransportHarness();
    const resumedTransport = createVoiceTransportHarness();
    const requestSessionToken = vi.fn().mockResolvedValue({
      token: 'auth_tokens/test-token',
      expireTime: '2099-03-09T12:30:00.000Z',
      newSessionExpireTime: '2099-03-09T12:01:30.000Z',
    });
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn(),
      requestSessionToken,
      createTransport: vi
        .fn()
        .mockReturnValueOnce(firstTransport.transport)
        .mockReturnValueOnce(resumedTransport.transport),
    });

    await controller.startSession({ mode: 'voice' });

    firstTransport.emit({
      type: 'session-resumption-update',
      handle: 'handles/voice-session-1',
      resumable: true,
    });
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
      expect(resumedTransport.connect).toHaveBeenCalledWith({
        token: {
          token: 'auth_tokens/test-token',
          expireTime: '2099-03-09T12:30:00.000Z',
          newSessionExpireTime: '2099-03-09T12:01:30.000Z',
        },
        mode: 'voice',
        resumeHandle: 'handles/voice-session-2',
      });
    });

    expect(requestSessionToken).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().voiceSessionResumption).toEqual({
      status: 'resumed',
      latestHandle: 'handles/voice-session-2',
      resumable: true,
      lastDetail: 'server draining',
    });
    expect(useSessionStore.getState().voiceSessionStatus).toBe('ready');
  });

  it('falls back to resumeFailed when a voice disconnect has no usable handle', async () => {
    const firstTransport = createVoiceTransportHarness();
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
      createTransport: vi.fn(() => firstTransport.transport),
    });

    await controller.startSession({ mode: 'voice' });
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
      expect(useSessionStore.getState().voiceSessionResumption).toEqual({
        status: 'resumeFailed',
        latestHandle: null,
        resumable: false,
        lastDetail: 'transport recycled (session marked non-resumable)',
      });
    });

    await vi.waitFor(() => {
      expect(useSessionStore.getState().speechLifecycle.status).toBe('off');
    });
    expect(useSessionStore.getState().voiceSessionStatus).toBe('disconnected');
    expect(useSessionStore.getState().lastRuntimeError).toBe(
      'transport recycled (session marked non-resumable)',
    );
  });

  it('does not reuse a stale resumption handle after the transport clears it', async () => {
    const firstTransport = createVoiceTransportHarness();
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
      createTransport: vi.fn(() => firstTransport.transport),
    });

    await controller.startSession({ mode: 'voice' });
    firstTransport.emit({
      type: 'session-resumption-update',
      handle: 'handles/stale-session',
      resumable: true,
    });
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
      expect(useSessionStore.getState().voiceSessionResumption).toEqual({
        status: 'resumeFailed',
        latestHandle: null,
        resumable: false,
        lastDetail: 'transport recycled (session marked non-resumable)',
      });
    });

    expect(firstTransport.connect).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().lastRuntimeError).toBe(
      'transport recycled (session marked non-resumable)',
    );
  });

  it('keeps live-session durability state idle when typed input is blocked outside speech mode', async () => {
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken: vi.fn(),
      createTransport: vi.fn(() => createUnusedTransport()),
    });

    await controller.submitTextTurn('Hello');

    expect(useSessionStore.getState().voiceSessionResumption).toEqual({
      status: 'idle',
      latestHandle: null,
      resumable: false,
      lastDetail: null,
    });
    expect(useSessionStore.getState().voiceSessionDurability).toEqual({
      compressionEnabled: false,
      tokenValid: false,
      tokenRefreshing: false,
      tokenRefreshFailed: false,
      expireTime: null,
      newSessionExpireTime: null,
      lastDetail: null,
    });
  });

  it('keeps live-session resumption state idle when typed input is blocked outside speech mode', async () => {
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken: vi.fn(),
      createTransport: vi.fn(() => createUnusedTransport()),
    });

    await controller.submitTextTurn('Hello');

    expect(useSessionStore.getState().voiceSessionResumption).toEqual(
      expectDefaultResumptionState(),
    );
  });
});
