import { describe, expect, it, vi } from 'vitest';
import { checkBackendHealth, requestSessionToken } from './backend';

describe('renderer backend api helper', () => {
  it('returns true when bridge health responds with status ok', async () => {
    const checkHealth = vi.fn().mockResolvedValue({ status: 'ok', timestamp: 'now' });
    const requestToken = vi.fn();
    window.bridge = {
      checkHealth,
      requestSessionToken: requestToken,
    };

    await expect(checkBackendHealth()).resolves.toBe(true);
    expect(checkHealth).toHaveBeenCalledTimes(1);
  });

  it('returns false when bridge health rejects or returns a non-ok payload', async () => {
    const requestToken = vi.fn();
    window.bridge = {
      checkHealth: vi.fn().mockResolvedValue({ status: 'bad', timestamp: 'now' }),
      requestSessionToken: requestToken,
    };

    await expect(checkBackendHealth()).resolves.toBe(false);

    window.bridge = {
      checkHealth: vi.fn().mockRejectedValue(new Error('network')),
      requestSessionToken: requestToken,
    };
    await expect(checkBackendHealth()).resolves.toBe(false);
  });

  it('delegates token request to bridge and returns response', async () => {
    const tokenResponse = {
      token: 't',
      expiresAt: 'later',
      isStub: true as const,
    };
    const checkHealth = vi.fn();
    const requestToken = vi.fn().mockResolvedValue(tokenResponse);
    window.bridge = {
      checkHealth,
      requestSessionToken: requestToken,
    };

    await expect(requestSessionToken({})).resolves.toEqual(tokenResponse);
    expect(requestToken).toHaveBeenCalledTimes(1);
    expect(requestToken).toHaveBeenCalledWith({});
  });

  it('propagates token request failures', async () => {
    const checkHealth = vi.fn();
    const requestToken = vi.fn().mockRejectedValue(new Error('token failed'));
    window.bridge = {
      checkHealth,
      requestSessionToken: requestToken,
    };

    await expect(requestSessionToken({})).rejects.toThrow('token failed');
  });
});
