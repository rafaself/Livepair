import 'reflect-metadata';
import { ServiceUnavailableException } from '@nestjs/common';

describe('SessionService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers().setSystemTime(new Date('2026-03-09T12:00:00.000Z'));
    process.env = {
      ...originalEnv,
      GEMINI_API_KEY: 'gemini-key',
      SESSION_TOKEN_LIVE_MODEL: 'models/gemini-2.0-flash-live-001',
      SESSION_TOKEN_LIVE_SESSION_RESUMPTION: 'true',
      EPHEMERAL_TOKEN_TTL_SECONDS: '60',
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env = originalEnv;
  });

  async function createSessionService() {
    const { SessionService } = await import('./session.service');

    const geminiAuthTokenClient = {
      createToken: jest.fn().mockResolvedValue({
        token: 'auth-tokens/constrained-token',
      }),
    };

    return {
      service: new SessionService(geminiAuthTokenClient as never),
      createToken: geminiAuthTokenClient.createToken,
    };
  }

  it('builds a constrained Gemini token request for the implemented voice session setup', async () => {
    const { service, createToken } = await createSessionService();

    await expect(service.createEphemeralToken({})).resolves.toEqual({
      token: 'auth-tokens/constrained-token',
      expireTime: '2026-03-09T12:30:00.000Z',
      newSessionExpireTime: '2026-03-09T12:01:00.000Z',
    });

    expect(createToken).toHaveBeenCalledWith({
      apiKey: 'gemini-key',
      newSessionExpireTime: '2026-03-09T12:01:00.000Z',
      expireTime: '2026-03-09T12:30:00.000Z',
      liveConnectConstraints: {
        model: 'models/gemini-2.0-flash-live-001',
        config: {
          responseModalities: ['AUDIO'],
          sessionResumption: {},
        },
      },
    });
  });

  it('fails fast when the constrained Live model is not configured', async () => {
    delete process.env['SESSION_TOKEN_LIVE_MODEL'];

    const { service } = await createSessionService();

    await expect(service.createEphemeralToken({})).rejects.toEqual(
      new ServiceUnavailableException('Session token Live model is not configured'),
    );
  });
});
