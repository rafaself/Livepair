import { describe, expect, it } from 'vitest';
import {
  checkBackendHealth,
  reportLiveTelemetry,
  requestSessionToken,
} from './backend';
import { createMockDesktopBridge } from '../test/bridgeMocks';
import type { LiveTelemetryEvent } from '@livepair/shared-types';

describe('renderer backend api helper', () => {
  it('returns true when bridge health responds with status ok', async () => {
    const bridge = createMockDesktopBridge();
    bridge.checkHealth.mockResolvedValue({ status: 'ok', timestamp: 'now' });
    window.bridge = bridge;

    await expect(checkBackendHealth()).resolves.toBe(true);
    expect(bridge.checkHealth).toHaveBeenCalledTimes(1);
  });

  it('returns false when bridge health rejects or returns a non-ok payload', async () => {
    const bridge = createMockDesktopBridge();
    bridge.checkHealth.mockResolvedValue({ status: 'bad', timestamp: 'now' });
    window.bridge = bridge;

    await expect(checkBackendHealth()).resolves.toBe(false);

    bridge.checkHealth.mockRejectedValue(new Error('network'));
    await expect(checkBackendHealth()).resolves.toBe(false);
  });

  it('delegates token request to bridge and returns response', async () => {
    const tokenRequest = {
      voiceSessionPolicy: {
        voice: 'Aoede' as const,
        systemInstruction: 'Stay concise.',
        groundingEnabled: false,
        mediaResolution: 'MEDIA_RESOLUTION_HIGH' as const,
        contextCompressionEnabled: false,
      },
    };
    const tokenResponse = {
      token: 't',
      expireTime: '2099-03-09T12:30:00.000Z',
      newSessionExpireTime: '2099-03-09T12:01:30.000Z',
    };
    const bridge = createMockDesktopBridge();
    bridge.requestSessionToken.mockResolvedValue(tokenResponse);
    window.bridge = bridge;

    await expect(requestSessionToken(tokenRequest)).resolves.toEqual(tokenResponse);
    expect(bridge.requestSessionToken).toHaveBeenCalledWith(tokenRequest);
  });

  it('propagates token request failures', async () => {
    const bridge = createMockDesktopBridge();
    bridge.requestSessionToken.mockRejectedValue(new Error('token failed'));
    window.bridge = bridge;

    await expect(requestSessionToken({})).rejects.toThrow('token failed');
  });

  it('delegates live telemetry batches to the bridge', async () => {
    const telemetryEvents: LiveTelemetryEvent[] = [
      {
        eventType: 'live_session_started',
        occurredAt: '2026-03-16T14:00:00.000Z',
        sessionId: 'live-session-1',
        chatId: 'chat-1',
        environment: 'test',
        platform: 'linux',
        appVersion: '0.0.1',
        model: 'models/gemini',
      },
    ];
    const bridge = createMockDesktopBridge();
    bridge.reportLiveTelemetry.mockResolvedValue(undefined);
    window.bridge = bridge;

    await expect(reportLiveTelemetry(telemetryEvents)).resolves.toBeUndefined();
    expect(bridge.reportLiveTelemetry).toHaveBeenCalledWith(telemetryEvents);
  });
});
