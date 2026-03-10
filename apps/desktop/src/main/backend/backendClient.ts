import type {
  CreateEphemeralTokenRequest,
  CreateEphemeralTokenResponse,
  HealthResponse,
} from '@livepair/shared-types';

type BackendClientOptions = {
  fetchImpl?: typeof fetch;
  getBackendUrl: () => Promise<string>;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isExpiredTimestamp(value: string, now = Date.now()): boolean {
  return Date.parse(value) <= now;
}

function parseCreateEphemeralTokenResponse(
  value: unknown,
): CreateEphemeralTokenResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Token response was invalid');
  }

  const payload = value as Record<string, unknown>;

  if (
    !isNonEmptyString(payload['token']) ||
    !isValidTimestamp(payload['expireTime']) ||
    !isValidTimestamp(payload['newSessionExpireTime'])
  ) {
    throw new Error('Token response was invalid');
  }

  if (
    isExpiredTimestamp(payload['expireTime']) ||
    isExpiredTimestamp(payload['newSessionExpireTime'])
  ) {
    throw new Error('Token response was expired before Live connect');
  }

  return {
    token: payload['token'],
    expireTime: payload['expireTime'],
    newSessionExpireTime: payload['newSessionExpireTime'],
  };
}

async function readErrorDetail(response: Response): Promise<string | null> {
  try {
    const text = (await response.text()).trim();

    if (!text) {
      return null;
    }

    try {
      const payload = JSON.parse(text) as {
        message?: unknown;
        error?: { message?: unknown } | unknown;
      };

      if (typeof payload.message === 'string' && payload.message.length > 0) {
        return payload.message;
      }

      if (
        payload.error &&
        typeof payload.error === 'object' &&
        'message' in payload.error &&
        typeof payload.error.message === 'string' &&
        payload.error.message.length > 0
      ) {
        return payload.error.message;
      }
    } catch {
      return text;
    }

    return text;
  } catch {
    return null;
  }
}

export type BackendClient = {
  checkHealth: () => Promise<HealthResponse>;
  requestSessionToken: (
    req: CreateEphemeralTokenRequest,
  ) => Promise<CreateEphemeralTokenResponse>;
};

export function createBackendClient({
  fetchImpl = fetch,
  getBackendUrl,
}: BackendClientOptions): BackendClient {
  return {
    async checkHealth(): Promise<HealthResponse> {
      const backendUrl = await getBackendUrl();
      const res = await fetchImpl(`${backendUrl}/health`);
      if (!res.ok) {
        const detail = await readErrorDetail(res);
        throw new Error(
          detail ? `Health check failed: ${res.status} - ${detail}` : `Health check failed: ${res.status}`,
        );
      }

      return (await res.json()) as HealthResponse;
    },

    async requestSessionToken(
      req: CreateEphemeralTokenRequest,
    ): Promise<CreateEphemeralTokenResponse> {
      const backendUrl = await getBackendUrl();
      const url = `${backendUrl}/session/token`;
      console.info('[desktop:backend-client] session token request started', {
        url,
        request: req,
      });

      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        const detail = await readErrorDetail(res);
        console.error('[desktop:backend-client] session token request failed', {
          url,
          status: res.status,
          detail,
        });
        throw new Error(
          detail ? `Token request failed: ${res.status} - ${detail}` : `Token request failed: ${res.status}`,
        );
      }

      return parseCreateEphemeralTokenResponse(await res.json());
    },
  };
}
