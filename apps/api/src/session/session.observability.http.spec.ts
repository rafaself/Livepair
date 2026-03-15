import 'reflect-metadata';
import {
  SESSION_TOKEN_AUTH_HEADER_NAME,
} from '@livepair/shared-types';
import type { AddressInfo } from 'net';

const SESSION_TOKEN_AUTH_SECRET = 'desktop-secret';
const SESSION_TOKEN_LIVE_MODEL = 'models/gemini-2.0-flash-live-001';
const SESSION_TOKEN_RATE_LIMIT_MAX_REQUESTS = 2;
const SESSION_TOKEN_RATE_LIMIT_WINDOW_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function expectNoSensitiveValues(
  spy: jest.SpyInstance,
  sensitiveValues: string[],
): void {
  const serializedCalls = JSON.stringify(spy.mock.calls);

  for (const value of sensitiveValues) {
    expect(serializedCalls).not.toContain(value);
  }
}

async function createTokenApp(options: {
  createToken?: jest.Mock<Promise<{ token: string }>, [Record<string, unknown>]>;
} = {}) {
  const { ValidationPipe } = await import('@nestjs/common');
  const { Test } = await import('@nestjs/testing');
  const { AppModule } = await import('../app.module');
  const { GeminiAuthTokenClient } = await import('./gemini-auth-token.client');
  const { ObservabilityService } = await import('../observability/observability.service');

  const createToken =
    options.createToken ??
    jest
      .fn<Promise<{ token: string }>, [Record<string, unknown>]>()
      .mockResolvedValue({
        token: 'auth-tokens/ephemeral-token',
      });

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(GeminiAuthTokenClient)
    .useValue({ createToken })
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.listen(0, '127.0.0.1');

  const address = app.getHttpServer().address() as AddressInfo;

  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
    createToken,
    observabilityService: app.get(ObservabilityService),
  };
}

async function createRealTokenApp() {
  const { ValidationPipe } = await import('@nestjs/common');
  const { Test } = await import('@nestjs/testing');
  const { AppModule } = await import('../app.module');
  const { ObservabilityService } = await import('../observability/observability.service');

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.listen(0, '127.0.0.1');

  const address = app.getHttpServer().address() as AddressInfo;

  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
    observabilityService: app.get(ObservabilityService),
  };
}

describe('Session token observability', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;
  let infoSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      GEMINI_API_KEY: 'gemini-key',
      SESSION_TOKEN_AUTH_SECRET,
      SESSION_TOKEN_LIVE_MODEL,
      SESSION_TOKEN_RATE_LIMIT_MAX_REQUESTS: String(
        SESSION_TOKEN_RATE_LIMIT_MAX_REQUESTS,
      ),
      SESSION_TOKEN_RATE_LIMIT_WINDOW_MS: String(SESSION_TOKEN_RATE_LIMIT_WINDOW_MS),
    };
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('observes successful token issuance and disables caching', async () => {
    const harness = await createTokenApp();

    try {
      const response = await fetch(`${harness.baseUrl}/session/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [SESSION_TOKEN_AUTH_HEADER_NAME]: SESSION_TOKEN_AUTH_SECRET,
        },
        body: JSON.stringify({ sessionId: 'session-1' }),
      });

      expect(response.status).toBe(201);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('pragma')).toBe('no-cache');
      expect(response.headers.get('expires')).toBe('0');

      const body = (await response.json()) as Record<string, unknown>;
      expect(body).toEqual({
        token: 'auth-tokens/ephemeral-token',
        expireTime: expect.any(String),
        newSessionExpireTime: expect.any(String),
      });

      await expect(harness.observabilityService.getMetrics()).resolves.toMatch(
        /livepair_session_token_requests_total\{outcome="issued"\} 1/,
      );
      expect(infoSpy).toHaveBeenCalledWith(
        '[session:token] issued',
        expect.objectContaining({
          constraintModel: SESSION_TOKEN_LIVE_MODEL,
          responseModalities: ['AUDIO'],
        }),
      );
      expectNoSensitiveValues(infoSpy, ['auth-tokens/ephemeral-token', SESSION_TOKEN_AUTH_SECRET]);
    } finally {
      await harness.app.close();
    }
  });

  it('observes auth rejection without leaking credentials', async () => {
    const harness = await createTokenApp();

    try {
      const response = await fetch(`${harness.baseUrl}/session/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(401);
      expect(response.headers.get('cache-control')).toBe('no-store');
      await expect(response.json()).resolves.toEqual({
        statusCode: 401,
        message: 'Session token credential is required',
        error: 'Unauthorized',
      });

      await expect(harness.observabilityService.getMetrics()).resolves.toMatch(
        /livepair_session_token_requests_total\{outcome="auth_required"\} 1/,
      );
      expect(warnSpy).toHaveBeenCalledWith(
        '[session:token] auth rejected',
        expect.objectContaining({
          reason: 'missing_credential',
        }),
      );
      expectNoSensitiveValues(warnSpy, [SESSION_TOKEN_AUTH_SECRET]);
    } finally {
      await harness.app.close();
    }
  });

  it('observes invalid credential rejection with 403', async () => {
    const harness = await createTokenApp();

    try {
      const response = await fetch(`${harness.baseUrl}/session/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [SESSION_TOKEN_AUTH_HEADER_NAME]: 'wrong-secret',
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(403);
      expect(response.headers.get('cache-control')).toBe('no-store');
      await expect(response.json()).resolves.toEqual({
        statusCode: 403,
        message: 'Session token credential is invalid',
        error: 'Forbidden',
      });

      await expect(harness.observabilityService.getMetrics()).resolves.toMatch(
        /livepair_session_token_requests_total\{outcome="auth_invalid"\} 1/,
      );
      expect(warnSpy).toHaveBeenCalledWith(
        '[session:token] auth rejected',
        expect.objectContaining({
          reason: 'invalid_credential',
        }),
      );
      expectNoSensitiveValues(warnSpy, [SESSION_TOKEN_AUTH_SECRET]);
    } finally {
      await harness.app.close();
    }
  });

  it('observes rate-limit rejection without leaking token values', async () => {
    const harness = await createTokenApp();

    try {
      await fetch(`${harness.baseUrl}/session/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [SESSION_TOKEN_AUTH_HEADER_NAME]: SESSION_TOKEN_AUTH_SECRET,
        },
        body: JSON.stringify({ sessionId: 'session-1' }),
      });

      await fetch(`${harness.baseUrl}/session/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [SESSION_TOKEN_AUTH_HEADER_NAME]: SESSION_TOKEN_AUTH_SECRET,
        },
        body: JSON.stringify({ sessionId: 'session-2' }),
      });

      const response = await fetch(`${harness.baseUrl}/session/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [SESSION_TOKEN_AUTH_HEADER_NAME]: SESSION_TOKEN_AUTH_SECRET,
        },
        body: JSON.stringify({ sessionId: 'session-3' }),
      });

      expect(response.status).toBe(429);
      expect(response.headers.get('cache-control')).toBe('no-store');
      await expect(response.json()).resolves.toEqual({
        statusCode: 429,
        message: 'Session token rate limit exceeded',
        error: 'Too Many Requests',
      });

      await expect(harness.observabilityService.getMetrics()).resolves.toMatch(
        /livepair_session_token_requests_total\{outcome="rate_limited"\} 1/,
      );
      expect(warnSpy).toHaveBeenCalledWith(
        '[session:token] rate limited',
        expect.objectContaining({
          limit: SESSION_TOKEN_RATE_LIMIT_MAX_REQUESTS,
          windowMs: SESSION_TOKEN_RATE_LIMIT_WINDOW_MS,
        }),
      );
      expectNoSensitiveValues(warnSpy, ['auth-tokens/ephemeral-token', SESSION_TOKEN_AUTH_SECRET]);
    } finally {
      await harness.app.close();
    }
  });

  it('observes upstream Gemini provisioning failure and returns a safe 502 response', async () => {
    const harness = await createRealTokenApp();
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
      ((input: string | URL | Request, init?: RequestInit) => {
        if (
          typeof input === 'string' &&
          input === 'https://generativelanguage.googleapis.com/v1alpha/auth_tokens'
        ) {
          return Promise.reject(new Error('network down'));
        }

        return originalFetch(input, init);
      }) as typeof fetch,
    );

    try {
      const response = await fetch(`${harness.baseUrl}/session/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [SESSION_TOKEN_AUTH_HEADER_NAME]: SESSION_TOKEN_AUTH_SECRET,
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(502);
      expect(response.headers.get('cache-control')).toBe('no-store');
      await expect(response.json()).resolves.toEqual({
        statusCode: 502,
        message: 'Gemini token provisioning failed',
        error: 'Bad Gateway',
      });

      await expect(harness.observabilityService.getMetrics()).resolves.toMatch(
        /livepair_session_token_requests_total\{outcome="upstream_failed"\} 1/,
      );
      expect(errorSpy).toHaveBeenCalledWith(
        '[session:token] upstream provisioning failed',
        expect.objectContaining({
          outcome: 'network_error',
          detail: 'network down',
        }),
      );
      expectNoSensitiveValues(errorSpy, [SESSION_TOKEN_AUTH_SECRET, 'auth-tokens/']);
    } finally {
      fetchSpy.mockRestore();
      await harness.app.close();
    }
  });

  it('recovers after the configured rate-limit window to keep local development usable', async () => {
    const harness = await createTokenApp();

    try {
      await fetch(`${harness.baseUrl}/session/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [SESSION_TOKEN_AUTH_HEADER_NAME]: SESSION_TOKEN_AUTH_SECRET,
        },
        body: JSON.stringify({ sessionId: 'session-1' }),
      });

      await fetch(`${harness.baseUrl}/session/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [SESSION_TOKEN_AUTH_HEADER_NAME]: SESSION_TOKEN_AUTH_SECRET,
        },
        body: JSON.stringify({ sessionId: 'session-2' }),
      });

      await fetch(`${harness.baseUrl}/session/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [SESSION_TOKEN_AUTH_HEADER_NAME]: SESSION_TOKEN_AUTH_SECRET,
        },
        body: JSON.stringify({ sessionId: 'session-3' }),
      });

      await sleep(SESSION_TOKEN_RATE_LIMIT_WINDOW_MS + 20);

      const recoveredResponse = await fetch(`${harness.baseUrl}/session/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [SESSION_TOKEN_AUTH_HEADER_NAME]: SESSION_TOKEN_AUTH_SECRET,
        },
        body: JSON.stringify({ sessionId: 'session-4' }),
      });

      expect(recoveredResponse.status).toBe(201);
    } finally {
      await harness.app.close();
    }
  });
});
