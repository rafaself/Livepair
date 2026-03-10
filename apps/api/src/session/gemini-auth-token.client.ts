import {
  BadGatewayException,
  Injectable,
} from '@nestjs/common';
import type { CreateEphemeralTokenResponse } from '@livepair/shared-types';

const GEMINI_AUTH_TOKEN_URL =
  'https://generativelanguage.googleapis.com/v1alpha/authTokens';

type GeminiAuthTokenPayload = {
  name?: unknown;
  expireTime?: unknown;
  newSessionExpireTime?: unknown;
};

function isCreateEphemeralTokenResponse(
  value: GeminiAuthTokenPayload,
): value is {
  name: string;
  expireTime: string;
  newSessionExpireTime: string;
} {
  return (
    typeof value.name === 'string' &&
    typeof value.expireTime === 'string' &&
    typeof value.newSessionExpireTime === 'string'
  );
}

export type GeminiAuthTokenRequest = {
  apiKey: string;
  newSessionExpireTime: string;
};

type RequestGeminiAuthTokenOptions = GeminiAuthTokenRequest & {
  fetchImpl?: typeof fetch;
};

export async function requestGeminiAuthToken({
  apiKey,
  fetchImpl = fetch,
  newSessionExpireTime,
}: RequestGeminiAuthTokenOptions): Promise<CreateEphemeralTokenResponse> {
  let response: Response;
  try {
    response = await fetchImpl(GEMINI_AUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        authToken: {
          uses: 1,
          newSessionExpireTime,
        },
      }),
    });
  } catch {
    throw new BadGatewayException('Gemini token request failed');
  }

  if (!response.ok) {
    throw new BadGatewayException('Gemini token request failed');
  }

  const payload = (await response.json()) as GeminiAuthTokenPayload;
  if (!isCreateEphemeralTokenResponse(payload)) {
    throw new BadGatewayException('Gemini token response was invalid');
  }

  return {
    token: payload.name,
    expireTime: payload.expireTime,
    newSessionExpireTime: payload.newSessionExpireTime,
  };
}

@Injectable()
export class GeminiAuthTokenClient {
  async createToken(
    request: GeminiAuthTokenRequest,
  ): Promise<CreateEphemeralTokenResponse> {
    return requestGeminiAuthToken(request);
  }
}
