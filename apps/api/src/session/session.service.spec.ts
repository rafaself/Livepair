import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { env } from '../config/env';
import { GeminiAuthTokenClient } from './gemini-auth-token.client';
import { SessionService } from './session.service';

describe('SessionService', () => {
  let service: SessionService;
  let createToken: jest.MockedFunction<GeminiAuthTokenClient['createToken']>;
  const originalGeminiApiKey = env.geminiApiKey;
  const originalEphemeralTokenTtlSeconds = env.ephemeralTokenTtlSeconds;

  beforeEach(() => {
    createToken = jest.fn();
    service = new SessionService({
      createToken,
    } as unknown as GeminiAuthTokenClient);
    env.geminiApiKey = 'gemini-key';
    env.ephemeralTokenTtlSeconds = 90;
    jest.useFakeTimers().setSystemTime(new Date('2026-03-09T12:00:00.000Z'));
  });

  afterEach(() => {
    env.geminiApiKey = originalGeminiApiKey;
    env.ephemeralTokenTtlSeconds = originalEphemeralTokenTtlSeconds;
    jest.useRealTimers();
  });

  it('returns a real ephemeral token response', async () => {
    createToken.mockResolvedValue({
      token: 'auth-tokens/abc123',
    });

    await expect(service.createEphemeralToken({})).resolves.toEqual({
      token: 'auth-tokens/abc123',
      expireTime: '2026-03-09T12:31:30.000Z',
      newSessionExpireTime: '2026-03-09T12:01:30.000Z',
    });
  });

  it('requests a one-time token with a TTL-derived new session expiry and relative overall expiry', async () => {
    createToken.mockResolvedValue({
      token: 'auth-tokens/abc123',
    });

    await service.createEphemeralToken({ sessionId: 'test-session' });

    expect(createToken).toHaveBeenCalledWith({
      apiKey: 'gemini-key',
      newSessionExpireTime: '2026-03-09T12:01:30.000Z',
      expireTime: '2026-03-09T12:31:30.000Z',
    });
  });

  it('throws a service unavailable error when the Gemini API key is missing', async () => {
    env.geminiApiKey = '';

    const tokenPromise = service.createEphemeralToken({});

    await expect(tokenPromise).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(tokenPromise).rejects.toMatchObject({
      message: 'Gemini API key is not configured',
      status: 503,
    });
    expect(createToken).not.toHaveBeenCalled();
  });

  it('propagates provider failures as bad gateway errors', async () => {
    createToken.mockRejectedValue(new BadGatewayException('Gemini token request failed'));

    const tokenPromise = service.createEphemeralToken({});

    await expect(tokenPromise).rejects.toBeInstanceOf(BadGatewayException);
    await expect(tokenPromise).rejects.toMatchObject({
      message: 'Gemini token request failed',
      status: 502,
    });
  });
});
