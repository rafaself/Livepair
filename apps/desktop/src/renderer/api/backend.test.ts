import { describe, expect, it, vi } from 'vitest';
import type { DesktopBridge } from '../../shared/desktopBridge';
import {
  checkBackendHealth,
  requestSessionToken,
} from './backend';

function createBridge() {
  return {
    overlayMode: 'linux-shape' as const,
    checkHealth: vi.fn(),
    requestSessionToken: vi.fn(),
    createChat: vi.fn(),
    getChat: vi.fn(),
    getOrCreateCurrentChat: vi.fn(),
    listChatMessages: vi.fn(),
    appendChatMessage: vi.fn(),
    createLiveSession: vi.fn(),
    listLiveSessions: vi.fn(),
    updateLiveSession: vi.fn(),
    endLiveSession: vi.fn(),
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
    setOverlayHitRegions: vi.fn(),
    setOverlayPointerPassthrough: vi.fn(),
  } satisfies DesktopBridge;
}

describe('renderer backend api helper', () => {
  it('returns true when bridge health responds with status ok', async () => {
    const bridge = createBridge();
    bridge.checkHealth.mockResolvedValue({ status: 'ok', timestamp: 'now' });
    window.bridge = bridge;

    await expect(checkBackendHealth()).resolves.toBe(true);
    expect(bridge.checkHealth).toHaveBeenCalledTimes(1);
  });

  it('returns false when bridge health rejects or returns a non-ok payload', async () => {
    const bridge = createBridge();
    bridge.checkHealth.mockResolvedValue({ status: 'bad', timestamp: 'now' });
    window.bridge = bridge;

    await expect(checkBackendHealth()).resolves.toBe(false);

    bridge.checkHealth.mockRejectedValue(new Error('network'));
    await expect(checkBackendHealth()).resolves.toBe(false);
  });

  it('delegates token request to bridge and returns response', async () => {
    const tokenResponse = {
      token: 't',
      expireTime: '2099-03-09T12:30:00.000Z',
      newSessionExpireTime: '2099-03-09T12:01:30.000Z',
    };
    const bridge = createBridge();
    bridge.requestSessionToken.mockResolvedValue(tokenResponse);
    window.bridge = bridge;

    await expect(requestSessionToken({})).resolves.toEqual(tokenResponse);
    expect(bridge.requestSessionToken).toHaveBeenCalledWith({});
  });

  it('propagates token request failures', async () => {
    const bridge = createBridge();
    bridge.requestSessionToken.mockRejectedValue(new Error('token failed'));
    window.bridge = bridge;

    await expect(requestSessionToken({})).rejects.toThrow('token failed');
  });
});
