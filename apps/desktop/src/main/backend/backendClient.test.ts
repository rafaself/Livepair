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
  const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  beforeEach(() => {
    getBackendUrl.mockClear();
    fetchImpl.mockReset();
    consoleInfoSpy.mockClear();
    consoleErrorSpy.mockClear();
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
      token: 'ephemeral-token',
      expireTime: 'later',
      newSessionExpireTime: 'soon',
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
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      '[desktop:backend-client] session token request started',
      {
        url: 'http://localhost:3000/session/token',
        request: req,
      },
    );
  });

  it('throws when the token endpoint returns a non-ok response', async () => {
    fetchImpl.mockResolvedValue({
      ok: false,
      status: 401,
      text: vi.fn(async () => '{"message":"Gemini token request failed: upstream 400 INVALID_ARGUMENT"}'),
    });

    const client = createBackendClient({ fetchImpl, getBackendUrl });

    await expect(client.requestSessionToken({})).rejects.toThrow(
      'Token request failed: 401 - Gemini token request failed: upstream 400 INVALID_ARGUMENT',
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[desktop:backend-client] session token request failed',
      {
        url: 'http://localhost:3000/session/token',
        status: 401,
        detail: 'Gemini token request failed: upstream 400 INVALID_ARGUMENT',
      },
    );
  });
});
