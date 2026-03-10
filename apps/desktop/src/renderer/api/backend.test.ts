import { describe, expect, it, vi } from 'vitest';
import { checkBackendHealth, requestSessionToken } from './backend';

describe('renderer backend api helper', () => {
  it('returns true when bridge health responds with status ok', async () => {
    const checkHealth = vi.fn().mockResolvedValue({ status: 'ok', timestamp: 'now' });
    const requestToken = vi.fn();
    window.bridge = {
      overlayMode: 'linux-shape',
      checkHealth,
      requestSessionToken: requestToken,
      getSettings: vi.fn(),
      updateSettings: vi.fn(),
      setOverlayHitRegions: vi.fn(),
      setOverlayPointerPassthrough: vi.fn(),
    };

    await expect(checkBackendHealth()).resolves.toBe(true);
    expect(checkHealth).toHaveBeenCalledTimes(1);
  });

  it('returns false when bridge health rejects or returns a non-ok payload', async () => {
    const requestToken = vi.fn();
    window.bridge = {
      overlayMode: 'linux-shape',
      checkHealth: vi.fn().mockResolvedValue({ status: 'bad', timestamp: 'now' }),
      requestSessionToken: requestToken,
      getSettings: vi.fn(),
      updateSettings: vi.fn(),
      setOverlayHitRegions: vi.fn(),
      setOverlayPointerPassthrough: vi.fn(),
    };

    await expect(checkBackendHealth()).resolves.toBe(false);

    window.bridge = {
      overlayMode: 'linux-shape',
      checkHealth: vi.fn().mockRejectedValue(new Error('network')),
      requestSessionToken: requestToken,
      getSettings: vi.fn(),
      updateSettings: vi.fn(),
      setOverlayHitRegions: vi.fn(),
      setOverlayPointerPassthrough: vi.fn(),
    };
    await expect(checkBackendHealth()).resolves.toBe(false);
  });

  it('delegates token request to bridge and returns response', async () => {
    const tokenResponse = {
      token: 't',
      expireTime: '2099-03-09T12:30:00.000Z',
      newSessionExpireTime: '2099-03-09T12:01:30.000Z',
    };
    const checkHealth = vi.fn();
    const requestToken = vi.fn().mockResolvedValue(tokenResponse);
    window.bridge = {
      overlayMode: 'linux-shape',
      checkHealth,
      requestSessionToken: requestToken,
      getSettings: vi.fn(),
      updateSettings: vi.fn(),
      setOverlayHitRegions: vi.fn(),
      setOverlayPointerPassthrough: vi.fn(),
    };

    await expect(requestSessionToken({})).resolves.toEqual(tokenResponse);
    expect(requestToken).toHaveBeenCalledTimes(1);
    expect(requestToken).toHaveBeenCalledWith({});
  });

  it('propagates token request failures', async () => {
    const checkHealth = vi.fn();
    const requestToken = vi.fn().mockRejectedValue(new Error('token failed'));
    window.bridge = {
      overlayMode: 'linux-shape',
      checkHealth,
      requestSessionToken: requestToken,
      getSettings: vi.fn(),
      updateSettings: vi.fn(),
      setOverlayHitRegions: vi.fn(),
      setOverlayPointerPassthrough: vi.fn(),
    };

    await expect(requestSessionToken({})).rejects.toThrow('token failed');
  });
});
