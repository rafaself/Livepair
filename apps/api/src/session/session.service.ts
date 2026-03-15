import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type {
  CreateEphemeralTokenRequest,
  CreateEphemeralTokenResponse,
} from '@livepair/shared-types';
import { env } from '../config/env';
import { GeminiAuthTokenClient } from './gemini-auth-token.client';

const DEFAULT_EPHEMERAL_TOKEN_EXPIRE_WINDOW_MS = 30 * 60 * 1000;

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

    if (!env.sessionTokenLiveModel) {
      throw new ServiceUnavailableException('Session token Live model is not configured');
    }

    if (!env.sessionTokenLiveModel.startsWith('models/')) {
      throw new ServiceUnavailableException(
        'Session token Live model must use the "models/..." resource format',
      );
    }

    const now = Date.now();

    // Window to initiate the session (default 60s)
    const sessionStartWindowMs = env.ephemeralTokenTtlSeconds * 1000;
    const newSessionExpireTime = new Date(now + sessionStartWindowMs).toISOString();

    // Keep token validity narrow while allowing custom start windows that exceed the default.
    const expireTime = new Date(
      now + Math.max(sessionStartWindowMs, DEFAULT_EPHEMERAL_TOKEN_EXPIRE_WINDOW_MS),
    ).toISOString();

    return this.geminiAuthTokenClient
      .createToken({
        apiKey: env.geminiApiKey,
        newSessionExpireTime,
        expireTime,
        liveConnectConstraints: {
          model: env.sessionTokenLiveModel,
          // Lock only the stable voice-session subset so renderer quality/transcription/tool
          // choices remain compatible with the current MVP runtime.
          config: {
            responseModalities: ['AUDIO'],
            sessionResumption: {},
          },
        },
      })
      .then((token) => ({
        token: token.token,
        expireTime,
        newSessionExpireTime,
      }));
  }
}
