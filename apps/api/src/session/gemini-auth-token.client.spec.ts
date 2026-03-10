import { BadGatewayException } from '@nestjs/common';
import { requestGeminiAuthToken } from './gemini-auth-token.client';

describe('requestGeminiAuthToken', () => {
  let fetchImpl: jest.MockedFunction<typeof fetch>;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchImpl = jest.fn() as jest.MockedFunction<typeof fetch>;
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
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
        expireTime: '2026-03-09T12:30:00.000Z',
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
          expireTime: '2026-03-09T12:30:00.000Z',
        }),
      },
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
        expireTime: '2026-03-09T12:30:00.000Z',
      }),
    ).rejects.toEqual(
      new BadGatewayException('Gemini token request failed: upstream 500 - backend unavailable'),
    );
  });

  it('maps network failures to a bad gateway error', async () => {
    fetchImpl.mockRejectedValue(new Error('network down'));

    await expect(
      requestGeminiAuthToken({
        apiKey: 'gemini-key',
        fetchImpl,
        newSessionExpireTime: '2026-03-09T12:01:30.000Z',
        expireTime: '2026-03-09T12:30:00.000Z',
      }),
    ).rejects.toEqual(new BadGatewayException('Gemini token request failed: network down'));
  });

  it('rejects malformed upstream payloads', async () => {
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        expireTime: '2026-03-09T12:30:00.000Z',
      }),
    } as Response);

    await expect(
      requestGeminiAuthToken({
        apiKey: 'gemini-key',
        fetchImpl,
        newSessionExpireTime: '2026-03-09T12:01:30.000Z',
        expireTime: '2026-03-09T12:30:00.000Z',
      }),
    ).rejects.toEqual(new BadGatewayException('Gemini token response was invalid'));
  });
});
