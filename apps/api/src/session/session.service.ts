import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  buildGeminiLiveConnectCapabilityConfig,
  buildGeminiLiveVoiceSessionPolicyConfig,
  GEMINI_LIVE_CONSTRAINED_EFFECTIVE_VOICE_SESSION_CAPABILITIES,
  type CreateEphemeralTokenRequest,
  type CreateEphemeralTokenResponse,
} from '@livepair/shared-types';
import { env } from '../config/env';
import { ObservabilityService } from '../observability/observability.service';
import {
  GEMINI_LIVE_AUTH_TOKEN_FIELD_MASK,
  GeminiAuthTokenClient,
} from './gemini-auth-token.client';

const DEFAULT_EPHEMERAL_TOKEN_EXPIRE_WINDOW_MS = 30 * 60 * 1000;

@Injectable()
export class SessionService {
  constructor(
    private readonly geminiAuthTokenClient: GeminiAuthTokenClient,
    private readonly observabilityService: ObservabilityService,
  ) {}

  async createEphemeralToken(
    req: CreateEphemeralTokenRequest,
  ): Promise<CreateEphemeralTokenResponse> {
    if (!env.geminiApiKey) {
      this.observabilityService.recordSessionTokenRequest({
        outcome: 'service_unavailable',
      });
      console.error('[session:token] service unavailable', {
        reason: 'gemini_api_key_missing',
      });
      throw new ServiceUnavailableException('Gemini API key is not configured');
    }

    if (!env.sessionTokenLiveModel) {
      this.observabilityService.recordSessionTokenRequest({
        outcome: 'service_unavailable',
      });
      console.error('[session:token] service unavailable', {
        reason: 'live_model_missing',
      });
      throw new ServiceUnavailableException('Session token Live model is not configured');
    }

    if (!env.sessionTokenLiveModel.startsWith('models/')) {
      this.observabilityService.recordSessionTokenRequest({
        outcome: 'service_unavailable',
      });
      console.error('[session:token] service unavailable', {
        reason: 'live_model_invalid',
      });
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

    try {
      const issuedCapabilities =
        GEMINI_LIVE_CONSTRAINED_EFFECTIVE_VOICE_SESSION_CAPABILITIES;
      const constrainedVoiceSessionConfig = {
        ...buildGeminiLiveConnectCapabilityConfig(issuedCapabilities),
        ...buildGeminiLiveVoiceSessionPolicyConfig(req.voiceSessionPolicy),
      };
      const token = await this.geminiAuthTokenClient.createToken({
        apiKey: env.geminiApiKey,
        newSessionExpireTime,
        expireTime,
        fieldMask: GEMINI_LIVE_AUTH_TOKEN_FIELD_MASK,
        liveConnectConstraints: {
          model: env.sessionTokenLiveModel,
          config: constrainedVoiceSessionConfig,
        },
      });

      this.observabilityService.recordSessionTokenRequest({
        outcome: 'issued',
      });
      console.info('[session:token] issued', {
        constraintModel: env.sessionTokenLiveModel,
        capabilities: issuedCapabilities,
        expireTime,
        newSessionExpireTime,
        sessionIdProvided:
          typeof req.sessionId === 'string' && req.sessionId.trim().length > 0,
        voiceSessionPolicyProvided: req.voiceSessionPolicy !== undefined,
      });

      return {
        token: token.token,
        expireTime,
        newSessionExpireTime,
      };
    } catch (error) {
      if (error instanceof BadGatewayException) {
        this.observabilityService.recordSessionTokenRequest({
          outcome: 'upstream_failed',
        });
      }

      throw error;
    }
  }
}
