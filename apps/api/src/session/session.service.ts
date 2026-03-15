import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type {
  CreateEphemeralTokenRequest,
  CreateEphemeralTokenResponse,
} from '@livepair/shared-types';
import { env } from '../config/env';
import { GeminiAuthTokenClient } from './gemini-auth-token.client';

@Injectable()
export class SessionService {
  constructor(
    private readonly geminiAuthTokenClient: GeminiAuthTokenClient,
  ) {}

  async createEphemeralToken(
    _req: CreateEphemeralTokenRequest,
  ): Promise<CreateEphemeralTokenResponse> {
    if (!env.geminiApiKey) {
      throw new ServiceUnavailableException('Gemini API key is not configured');
    }

    const now = Date.now();

    // Window to initiate the session (default 60s)
    const sessionStartWindowMs = env.ephemeralTokenTtlSeconds * 1000;
    const newSessionExpireTime = new Date(now + sessionStartWindowMs).toISOString();

    // Absolute token validity (defaulting to 30m beyond the start window for the session duration)
    const expireTime = new Date(
      now + sessionStartWindowMs + 30 * 60 * 1000,
    ).toISOString();

    return this.geminiAuthTokenClient
      .createToken({
        apiKey: env.geminiApiKey,
        newSessionExpireTime,
        expireTime,
      })
      .then((token) => ({
        token: token.token,
        expireTime,
        newSessionExpireTime,
      }));
  }
}
