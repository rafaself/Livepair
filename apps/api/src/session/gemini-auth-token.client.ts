import {
  BadGatewayException,
  Injectable,
} from '@nestjs/common';
import { ObservabilityService } from '../observability/observability.service';

const GEMINI_AUTH_TOKEN_URL =
  'https://generativelanguage.googleapis.com/v1alpha/auth_tokens';

type GeminiAuthTokenPayload = {
  name?: unknown;
};

function isNormalizedAuthTokenPayload(
  value: GeminiAuthTokenPayload,
): value is {
  name: string;
} {
  return typeof value.name === 'string' && value.name.trim().length > 0;
}

export type GeminiAuthTokenRequest = {
  apiKey: string;
  newSessionExpireTime: string;
  expireTime: string;
  liveConnectConstraints: {
    model: string;
    config: {
      responseModalities: ['AUDIO'];
      sessionResumption: Record<string, never>;
    };
  };
};

export type GeminiProvisionedToken = {
  token: string;
};

type GeminiAuthTokenRequestOutcome =
  | 'success'
  | 'network_error'
  | 'upstream_error'
  | 'invalid_payload';

type RequestGeminiAuthTokenOptions = GeminiAuthTokenRequest & {
  fetchImpl?: typeof fetch;
  observabilityService?: ObservabilityService;
};

async function readUpstreamErrorDetail(response: Response): Promise<string | null> {
  try {
    const text = (await response.text()).trim();

    if (!text) {
      return null;
    }

    try {
      const payload = JSON.parse(text) as {
        error?: {
          message?: unknown;
          status?: unknown;
          code?: unknown;
        };
        message?: unknown;
      };

      if (payload.error && typeof payload.error.message === 'string') {
        return payload.error.message;
      }

      if (typeof payload.message === 'string') {
        return payload.message;
      }
    } catch {
      return text;
    }

    return text;
  } catch {
    return null;
  }
}

export async function requestGeminiAuthToken({
  apiKey,
  fetchImpl = fetch,
  newSessionExpireTime,
  expireTime,
  liveConnectConstraints,
  observabilityService,
}: RequestGeminiAuthTokenOptions): Promise<GeminiProvisionedToken> {
  const startTime = process.hrtime.bigint();
  let outcome: GeminiAuthTokenRequestOutcome | null = null;
  try {
    let response: Response;
    try {
      response = await fetchImpl(GEMINI_AUTH_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          uses: 1,
          newSessionExpireTime,
          expireTime,
          liveConnectConstraints,
        }),
      });
    } catch (error) {
      outcome = 'network_error';
      const detail = error instanceof Error && error.message.length > 0
        ? error.message
        : 'network failure';
      console.error('[session:token] upstream provisioning failed', {
        outcome,
        detail,
        errorName: error instanceof Error ? error.name : 'Error',
      });
      throw new BadGatewayException('Gemini token provisioning failed');
    }

    if (!response.ok) {
      outcome = 'upstream_error';
      const detail = await readUpstreamErrorDetail(response);
      console.error('[session:token] upstream provisioning failed', {
        outcome,
        status: response.status,
        detail,
      });
      throw new BadGatewayException('Gemini token provisioning failed');
    }

    let payload: GeminiAuthTokenPayload;
    try {
      payload = (await response.json()) as GeminiAuthTokenPayload;
    } catch {
      outcome = 'invalid_payload';
      console.error('[session:token] upstream provisioning failed', {
        outcome,
      });
      throw new BadGatewayException('Gemini token provisioning failed');
    }

    if (!isNormalizedAuthTokenPayload(payload)) {
      outcome = 'invalid_payload';
      console.error('[session:token] upstream provisioning failed', {
        outcome,
      });
      throw new BadGatewayException('Gemini token provisioning failed');
    }

    outcome = 'success';

    return {
      token: payload.name,
    };
  } finally {
    if (observabilityService && outcome !== null) {
      const durationSeconds =
        Number(process.hrtime.bigint() - startTime) / 1_000_000_000;

      observabilityService.recordGeminiAuthTokenRequest(
        { outcome },
        durationSeconds,
      );
    }
  }
}

@Injectable()
export class GeminiAuthTokenClient {
  constructor(
    private readonly observabilityService: ObservabilityService,
  ) {}

  async createToken(
    request: GeminiAuthTokenRequest,
  ): Promise<GeminiProvisionedToken> {
    return requestGeminiAuthToken({
      ...request,
      observabilityService: this.observabilityService,
    });
  }
}
