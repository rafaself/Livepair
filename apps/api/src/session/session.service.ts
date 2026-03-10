import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type {
  CreateEphemeralTokenRequest,
  CreateEphemeralTokenResponse,
  TextChatRequest,
  TextChatStreamEvent,
} from '@livepair/shared-types';
import { env } from '../config/env';
import { formatTimestamp } from '@livepair/shared-utils';
import { GeminiAuthTokenClient } from './gemini-auth-token.client';
import { GeminiTextClient } from './gemini-text.client';

function getValidatedTextModel(model: string): string {
  const normalized = model.trim();

  if (!normalized) {
    throw new ServiceUnavailableException('Gemini text model is not configured');
  }

  const lowerCaseModel = normalized.toLowerCase();
  if (lowerCaseModel.includes('live') || lowerCaseModel.includes('audio')) {
    throw new ServiceUnavailableException(
      'Invalid Gemini text model config: text mode cannot use Gemini Live or audio models',
    );
  }

  return normalized;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly geminiAuthTokenClient: GeminiAuthTokenClient,
    private readonly geminiTextClient: GeminiTextClient,
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
    const newSessionExpireTime = formatTimestamp(
      new Date(now + sessionStartWindowMs),
    );

    // Absolute token validity (defaulting to 30m beyond the start window for the session duration)
    const expireTime = formatTimestamp(
      new Date(now + sessionStartWindowMs + 30 * 60 * 1000),
    );

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

  streamTextChat(
    req: TextChatRequest,
    options: { signal?: AbortSignal } = {},
  ): AsyncGenerator<TextChatStreamEvent> {
    if (!env.geminiApiKey) {
      throw new ServiceUnavailableException('Gemini API key is not configured');
    }

    return this.geminiTextClient.streamText({
      apiKey: env.geminiApiKey,
      model: getValidatedTextModel(env.geminiTextModel),
      messages: req.messages,
      ...(options.signal ? { signal: options.signal } : {}),
    });
  }
}
