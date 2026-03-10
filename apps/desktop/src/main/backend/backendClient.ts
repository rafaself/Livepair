import type {
  CreateEphemeralTokenRequest,
  CreateEphemeralTokenResponse,
  HealthResponse,
} from '@livepair/shared-types';

type BackendClientOptions = {
  fetchImpl?: typeof fetch;
  getBackendUrl: () => Promise<string>;
};

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
      const res = await fetchImpl(`${backendUrl}/session/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        const detail = await readErrorDetail(res);
        throw new Error(
          detail ? `Token request failed: ${res.status} - ${detail}` : `Token request failed: ${res.status}`,
        );
      }

      return (await res.json()) as CreateEphemeralTokenResponse;
    },
  };
}
