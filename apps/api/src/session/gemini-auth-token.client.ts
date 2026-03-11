import {
  BadGatewayException,
  Injectable,
} from '@nestjs/common';

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
};

export type GeminiProvisionedToken = {
  token: string;
};

type RequestGeminiAuthTokenOptions = GeminiAuthTokenRequest & {
  fetchImpl?: typeof fetch;
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
}: RequestGeminiAuthTokenOptions): Promise<GeminiProvisionedToken> {
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
      }),
    });
  } catch (error) {
    console.error('[session:gemini-auth-token] network request failed', error);
    const detail = error instanceof Error && error.message.length > 0
      ? error.message
      : 'network failure';
    throw new BadGatewayException(`Gemini token request failed: ${detail}`);
  }

  if (!response.ok) {
    const detail = await readUpstreamErrorDetail(response);
    console.error('[session:gemini-auth-token] upstream request failed', {
      status: response.status,
      detail,
    });
    throw new BadGatewayException(
      detail
        ? `Gemini token request failed: upstream ${response.status} - ${detail}`
        : `Gemini token request failed: upstream ${response.status}`,
    );
  }

  const payload = (await response.json()) as GeminiAuthTokenPayload;
  if (!isNormalizedAuthTokenPayload(payload)) {
    throw new BadGatewayException('Gemini token response was invalid');
  }

  return {
    token: payload.name,
  };
}

@Injectable()
export class GeminiAuthTokenClient {
  async createToken(
    request: GeminiAuthTokenRequest,
  ): Promise<GeminiProvisionedToken> {
    return requestGeminiAuthToken(request);
  }
}
