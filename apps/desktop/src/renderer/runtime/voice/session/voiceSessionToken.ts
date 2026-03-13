import type { CreateEphemeralTokenResponse } from '@livepair/shared-types';

export const TOKEN_REFRESH_LEEWAY_MS = 60_000;

export function isTokenValidForReconnect(
  token: CreateEphemeralTokenResponse | null,
  now = Date.now(),
): boolean {
  if (!token) {
    return false;
  }

  return Date.parse(token.expireTime) - now > TOKEN_REFRESH_LEEWAY_MS;
}
