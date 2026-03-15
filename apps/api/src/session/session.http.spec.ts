import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import {
  SESSION_TOKEN_AUTH_HEADER_NAME,
  type CreateEphemeralTokenResponse,
} from '@livepair/shared-types';
import type { AddressInfo } from 'net';

const SESSION_TOKEN_AUTH_SECRET = 'desktop-secret';

async function createTokenApp() {
  const { ValidationPipe } = await import('@nestjs/common');
  const { Test } = await import('@nestjs/testing');
  const { AppModule } = await import('../app.module');
  const { SessionService } = await import('./session.service');

  const createEphemeralToken = jest.fn<
    Promise<CreateEphemeralTokenResponse>,
    [Record<string, unknown>]
  >().mockResolvedValue({
    token: 'ephemeral-token',
    expireTime: '2099-03-09T12:30:00.000Z',
    newSessionExpireTime: '2099-03-09T12:01:30.000Z',
  });

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(SessionService)
    .useValue({ createEphemeralToken })
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.listen(0, '127.0.0.1');

  const address = app.getHttpServer().address() as AddressInfo;

  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
    createEphemeralToken,
  };
}

describe('Session token HTTP auth', () => {
  const originalEnv = process.env;
  let app: INestApplication | undefined;
  let harness:
    | Awaited<ReturnType<typeof createTokenApp>>
    | undefined;

  beforeAll(async () => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      SESSION_TOKEN_AUTH_SECRET,
    };
    harness = await createTokenApp();
    app = harness.app;
  });

  beforeEach(() => {
    harness?.createEphemeralToken.mockClear();
  });

  afterAll(async () => {
    process.env = originalEnv;

    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('rejects missing token endpoint credentials with 401', async () => {
    if (!harness) {
      throw new Error('Token auth test harness was not initialized');
    }

    const response = await fetch(`${harness.baseUrl}/session/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      statusCode: 401,
      message: 'Session token credential is required',
      error: 'Unauthorized',
    });
    expect(harness.createEphemeralToken).not.toHaveBeenCalled();
  });

  it('rejects invalid token endpoint credentials with 403', async () => {
    if (!harness) {
      throw new Error('Token auth test harness was not initialized');
    }

    const response = await fetch(`${harness.baseUrl}/session/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [SESSION_TOKEN_AUTH_HEADER_NAME]: 'wrong-secret',
      },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      statusCode: 403,
      message: 'Session token credential is invalid',
      error: 'Forbidden',
    });
    expect(harness.createEphemeralToken).not.toHaveBeenCalled();
  });

  it('allows token requests with the configured credential', async () => {
    if (!harness) {
      throw new Error('Token auth test harness was not initialized');
    }

    const response = await fetch(`${harness.baseUrl}/session/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [SESSION_TOKEN_AUTH_HEADER_NAME]: SESSION_TOKEN_AUTH_SECRET,
      },
      body: JSON.stringify({ sessionId: 'session-1' }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      token: 'ephemeral-token',
      expireTime: '2099-03-09T12:30:00.000Z',
      newSessionExpireTime: '2099-03-09T12:01:30.000Z',
    });
    expect(harness.createEphemeralToken).toHaveBeenCalledWith({ sessionId: 'session-1' });
  });
});
