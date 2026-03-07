import { Injectable } from '@nestjs/common';
import type {
  CreateEphemeralTokenRequest,
  CreateEphemeralTokenResponse,
} from '@livepair/shared-types';
import { env } from '../config/env';
import { formatTimestamp } from '@livepair/shared-utils';

@Injectable()
export class SessionService {
  createEphemeralToken(
    _req: CreateEphemeralTokenRequest,
  ): CreateEphemeralTokenResponse {
    // TODO: replace with real Gemini ephemeral token issuance
    const expiresAt = new Date(
      Date.now() + env.ephemeralTokenTtlSeconds * 1000,
    );
    return {
      token: 'stub-token-replace-with-real-gemini-token',
      expiresAt: formatTimestamp(expiresAt),
      isStub: true,
    };
  }
}
