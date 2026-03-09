import type {
  CreateEphemeralTokenRequest,
  CreateEphemeralTokenResponse,
  HealthResponse,
} from '@livepair/shared-types';

type BackendClientOptions = {
  fetchImpl?: typeof fetch;
  getBackendUrl: () => Promise<string>;
};

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
        throw new Error(`Health check failed: ${res.status}`);
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
        throw new Error(`Token request failed: ${res.status}`);
      }

      return (await res.json()) as CreateEphemeralTokenResponse;
    },
  };
}
