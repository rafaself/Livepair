import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type {
  CreateEphemeralTokenRequest,
  CreateEphemeralTokenResponse,
} from '@livepair/shared-types';
import { env } from '../config/env';
import { formatTimestamp } from '@livepair/shared-utils';
import { GeminiAuthTokenClient } from './gemini-auth-token.client';

@Injectable()
export class SessionService {
  constructor(private readonly geminiAuthTokenClient: GeminiAuthTokenClient) {}

  async createEphemeralToken(
    _req: CreateEphemeralTokenRequest,
  ): Promise<CreateEphemeralTokenResponse> {
    if (!env.geminiApiKey) {
      throw new ServiceUnavailableException('Gemini API key is not configured');
    }

    const newSessionExpireTime = formatTimestamp(
      new Date(Date.now() + env.ephemeralTokenTtlSeconds * 1000),
    );

    return this.geminiAuthTokenClient.createToken({
      apiKey: env.geminiApiKey,
      newSessionExpireTime,
    });
  }
}
