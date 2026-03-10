import { BadGatewayException } from '@nestjs/common';
import { requestGeminiAuthToken } from './gemini-auth-token.client';

describe('requestGeminiAuthToken', () => {
  let fetchImpl: jest.MockedFunction<typeof fetch>;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleInfoSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchImpl = jest.fn() as jest.MockedFunction<typeof fetch>;
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleInfoSpy.mockRestore();
  });

  it('maps the Gemini auth token payload into the shared response shape', async () => {
    fetchImpl.mockResolvedValue({
      ok: true,
      json: async () => ({
        name: 'auth-tokens/abc123',
        expireTime: '2026-03-09T12:30:00.000Z',
        newSessionExpireTime: '2026-03-09T12:01:30.000Z',
      }),
    } as Response);

    await expect(
      requestGeminiAuthToken({
        apiKey: 'gemini-key',
        fetchImpl,
        newSessionExpireTime: '2026-03-09T12:01:30.000Z',
      }),
    ).resolves.toEqual({
      token: 'auth-tokens/abc123',
      expireTime: '2026-03-09T12:30:00.000Z',
      newSessionExpireTime: '2026-03-09T12:01:30.000Z',
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1alpha/auth_tokens',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': 'gemini-key',
        },
        body: JSON.stringify({
          uses: 1,
          newSessionExpireTime: '2026-03-09T12:01:30.000Z',
        }),
      },
    );
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      '[session:gemini-auth-token] upstream request started',
      expect.objectContaining({
        url: 'https://generativelanguage.googleapis.com/v1alpha/auth_tokens',
        request: {
          uses: 1,
          newSessionExpireTime: '2026-03-09T12:01:30.000Z',
        },
      }),
    );
  });

  it('maps upstream non-ok responses to a bad gateway error', async () => {
    fetchImpl.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({
        error: {
          code: 500,
          message: 'backend unavailable',
        },
      }),
    } as Response);

    await expect(
      requestGeminiAuthToken({
        apiKey: 'gemini-key',
        fetchImpl,
        newSessionExpireTime: '2026-03-09T12:01:30.000Z',
      }),
    ).rejects.toEqual(
      new BadGatewayException('Gemini token request failed: upstream 500 - backend unavailable'),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[session:gemini-auth-token] upstream request failed',
      expect.objectContaining({
        status: 500,
        detail: 'backend unavailable',
      }),
    );
  });

  it('maps network failures to a bad gateway error', async () => {
    fetchImpl.mockRejectedValue(new Error('network down'));

    await expect(
      requestGeminiAuthToken({
        apiKey: 'gemini-key',
        fetchImpl,
        newSessionExpireTime: '2026-03-09T12:01:30.000Z',
      }),
    ).rejects.toEqual(new BadGatewayException('Gemini token request failed: network down'));
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[session:gemini-auth-token] network request failed',
      expect.any(Error),
    );
  });

  it('rejects malformed upstream payloads', async () => {
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: jest.fn((header: string) => (header.toLowerCase() === 'content-type'
          ? 'application/json; charset=UTF-8'
          : null)),
      },
      json: async () => ({
        expireTime: '2026-03-09T12:30:00.000Z',
      }),
    } as Response);

    await expect(
      requestGeminiAuthToken({
        apiKey: 'gemini-key',
        fetchImpl,
        newSessionExpireTime: '2026-03-09T12:01:30.000Z',
      }),
    ).rejects.toEqual(new BadGatewayException('Gemini token response was invalid'));
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      '[session:gemini-auth-token] upstream response received',
      expect.objectContaining({
        status: 200,
        contentType: 'application/json; charset=UTF-8',
      }),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[session:gemini-auth-token] upstream response payload invalid',
      expect.objectContaining({
        status: 200,
        payloadShape: {
          expireTime: 'string',
        },
        missingFields: ['name', 'newSessionExpireTime'],
      }),
    );
  });
});
