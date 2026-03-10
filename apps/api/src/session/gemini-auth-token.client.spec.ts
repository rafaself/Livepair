import { BadGatewayException } from '@nestjs/common';
import { requestGeminiAuthToken } from './gemini-auth-token.client';

describe('requestGeminiAuthToken', () => {
  let fetchImpl: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchImpl = jest.fn() as jest.MockedFunction<typeof fetch>;
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
      'https://generativelanguage.googleapis.com/v1alpha/authTokens',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': 'gemini-key',
        },
        body: JSON.stringify({
          authToken: {
            uses: 1,
            newSessionExpireTime: '2026-03-09T12:01:30.000Z',
          },
        }),
      },
    );
  });

  it('maps upstream non-ok responses to a bad gateway error', async () => {
    fetchImpl.mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    await expect(
      requestGeminiAuthToken({
        apiKey: 'gemini-key',
        fetchImpl,
        newSessionExpireTime: '2026-03-09T12:01:30.000Z',
      }),
    ).rejects.toEqual(new BadGatewayException('Gemini token request failed'));
  });

  it('maps network failures to a bad gateway error', async () => {
    fetchImpl.mockRejectedValue(new Error('network down'));

    await expect(
      requestGeminiAuthToken({
        apiKey: 'gemini-key',
        fetchImpl,
        newSessionExpireTime: '2026-03-09T12:01:30.000Z',
      }),
    ).rejects.toEqual(new BadGatewayException('Gemini token request failed'));
  });

  it('rejects malformed upstream payloads', async () => {
    fetchImpl.mockResolvedValue({
      ok: true,
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
  });
});
