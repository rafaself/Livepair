import { describe, expect, it } from 'vitest';
import { isTokenValidForReconnect, TOKEN_REFRESH_LEEWAY_MS } from './voiceSessionToken';

describe('isTokenValidForReconnect', () => {
  const now = Date.parse('2026-03-09T12:00:00.000Z');

  it('returns false when token is null', () => {
    expect(isTokenValidForReconnect(null, now)).toBe(false);
  });

  it('returns true when token expires well after the leeway', () => {
    expect(
      isTokenValidForReconnect(
        {
          token: 'auth_tokens/test',
          expireTime: '2099-03-09T12:30:00.000Z',
          newSessionExpireTime: '2099-03-09T12:01:30.000Z',
        },
        now,
      ),
    ).toBe(true);
  });

  it('returns false when token expires within the leeway window', () => {
    const nearExpiry = new Date(now + TOKEN_REFRESH_LEEWAY_MS - 1).toISOString();
    expect(
      isTokenValidForReconnect(
        {
          token: 'auth_tokens/near-expiry',
          expireTime: nearExpiry,
          newSessionExpireTime: nearExpiry,
        },
        now,
      ),
    ).toBe(false);
  });

  it('returns false when token is already expired', () => {
    expect(
      isTokenValidForReconnect(
        {
          token: 'auth_tokens/expired',
          expireTime: '2020-01-01T00:00:00.000Z',
          newSessionExpireTime: '2020-01-01T00:00:00.000Z',
        },
        now,
      ),
    ).toBe(false);
  });

  it('returns true when token expires exactly at the leeway boundary plus one ms', () => {
    const exactBoundary = new Date(now + TOKEN_REFRESH_LEEWAY_MS + 1).toISOString();
    expect(
      isTokenValidForReconnect(
        {
          token: 'auth_tokens/boundary',
          expireTime: exactBoundary,
          newSessionExpireTime: exactBoundary,
        },
        now,
      ),
    ).toBe(true);
  });
});
