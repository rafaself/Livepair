// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CreateEphemeralTokenRequest,
  CreateEphemeralTokenResponse,
  HealthResponse,
} from '@livepair/shared-types';
import { createBackendClient } from './backendClient';

describe('backendClient', () => {
  const getBackendUrl = vi.fn(async () => 'http://localhost:3000');
  const fetchImpl = vi.fn();

  beforeEach(() => {
    getBackendUrl.mockClear();
    fetchImpl.mockReset();
  });

  it('checks backend health through the configured backend URL', async () => {
    const response: HealthResponse = { status: 'ok', timestamp: 'now' };
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(async () => response),
    });

    const client = createBackendClient({ fetchImpl, getBackendUrl });

    await expect(client.checkHealth()).resolves.toEqual(response);
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:3000/health');
  });

  it('throws when the health endpoint returns a non-ok response', async () => {
    fetchImpl.mockResolvedValue({ ok: false, status: 503 });

    const client = createBackendClient({ fetchImpl, getBackendUrl });

    await expect(client.checkHealth()).rejects.toThrow('Health check failed: 503');
  });

  it('requests a session token through the configured backend URL', async () => {
    const req: CreateEphemeralTokenRequest = { sessionId: 'session-1' };
    const response: CreateEphemeralTokenResponse = {
      token: 'stub-token',
      expiresAt: 'later',
      isStub: true,
    };
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(async () => response),
    });

    const client = createBackendClient({ fetchImpl, getBackendUrl });

    await expect(client.requestSessionToken(req)).resolves.toEqual(response);
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:3000/session/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
  });

  it('throws when the token endpoint returns a non-ok response', async () => {
    fetchImpl.mockResolvedValue({ ok: false, status: 401 });

    const client = createBackendClient({ fetchImpl, getBackendUrl });

    await expect(client.requestSessionToken({})).rejects.toThrow(
      'Token request failed: 401',
    );
  });
});
