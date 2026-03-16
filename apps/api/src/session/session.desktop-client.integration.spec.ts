import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import {
  buildGeminiLiveConnectCapabilityConfig,
  type CreateEphemeralTokenResponse,
} from '@livepair/shared-types';
import type { AddressInfo } from 'net';
import { createRequire } from 'module';

const GEMINI_AUTH_TOKEN_URL =
  'https://generativelanguage.googleapis.com/v1alpha/auth_tokens';
const SESSION_TOKEN_AUTH_SECRET = 'desktop-secret';
const SESSION_TOKEN_LIVE_MODEL = 'models/gemini-2.5-flash-native-audio-preview-12-2025';

type TokenAppOptions = {
  sessionTokenRateLimitMaxRequests?: number;
  sessionServiceOverride?: {
    createEphemeralToken: (
      request: Record<string, unknown>,
    ) => Promise<CreateEphemeralTokenResponse>;
  };
};

type DesktopBackendClient = {
  requestSessionToken: (request: { sessionId?: string }) => Promise<CreateEphemeralTokenResponse>;
};

const requireFromHere = createRequire(__filename);

function normalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeJsonValue(entry));
  }

  if (value && typeof value === 'object') {
    const normalized = Object.create(null) as Record<string, unknown>;

    for (const [key, entry] of Object.entries(value)) {
      normalized[key] = normalizeJsonValue(entry);
    }

    return normalized;
  }

  return value;
}

function createDesktopFetch(fetchBase: typeof fetch): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const response = await fetchBase(input as never, init);

    return {
      ok: response.ok,
      status: response.status,
      headers: response.headers,
      text: () => response.text(),
      json: async () => normalizeJsonValue(await response.json()),
    } as Response;
  }) as typeof fetch;
}

async function createTokenApp({
  sessionTokenRateLimitMaxRequests = 2,
  sessionServiceOverride,
}: TokenAppOptions = {}): Promise<{
  app: INestApplication;
  baseUrl: string;
}> {
  process.env['SESSION_TOKEN_RATE_LIMIT_MAX_REQUESTS'] = String(
    sessionTokenRateLimitMaxRequests,
  );

  const { ValidationPipe } = await import('@nestjs/common');
  const { Test } = await import('@nestjs/testing');
  const { AppModule } = await import('../app.module');

  const testingModule = Test.createTestingModule({
    imports: [AppModule],
  });

  if (sessionServiceOverride) {
    const { SessionService } = await import('./session.service');
    testingModule.overrideProvider(SessionService).useValue(sessionServiceOverride);
  }

  const moduleRef = await testingModule.compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.listen(0, '127.0.0.1');

  const address = app.getHttpServer().address() as AddressInfo;

  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function createDesktopBackendClient(
  baseUrl: string,
  fetchImpl: typeof fetch = createDesktopFetch(global.fetch),
): Promise<DesktopBackendClient> {
  const { createBackendClient } = requireFromHere(
    '../../../desktop/src/main/backend/backendClient',
  ) as {
    createBackendClient: (options: {
      fetchImpl: typeof fetch;
      getBackendUrl: () => Promise<string>;
    }) => DesktopBackendClient;
  };

  return createBackendClient({
    fetchImpl,
    getBackendUrl: async () => baseUrl,
  });
}

describe('desktop client protected token flow', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      GEMINI_API_KEY: 'gemini-key',
      SESSION_TOKEN_AUTH_SECRET,
      SESSION_TOKEN_LIVE_MODEL,
      SESSION_TOKEN_RATE_LIMIT_MAX_REQUESTS: '2',
      SESSION_TOKEN_RATE_LIMIT_WINDOW_MS: '60000',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('requests a protected constrained token end-to-end through the desktop client', async () => {
    const geminiRequests: Array<Record<string, unknown>> = [];
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
      ((input: string | URL | Request, init?: RequestInit) => {
        if (typeof input === 'string' && input === GEMINI_AUTH_TOKEN_URL) {
          geminiRequests.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);

          return Promise.resolve(
            new Response(JSON.stringify({ name: 'auth-tokens/live-token' }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }

        return originalFetch(input as never, init);
      }) as typeof fetch,
    );
    const harness = await createTokenApp();

    try {
      const client = await createDesktopBackendClient(
        harness.baseUrl,
        createDesktopFetch(originalFetch),
      );
      const token = await client.requestSessionToken({ sessionId: 'session-1' });

      expect(token).toEqual({
        token: 'auth-tokens/live-token',
        expireTime: expect.any(String),
        newSessionExpireTime: expect.any(String),
      });

      const now = Date.now();
      expect(Date.parse(token.newSessionExpireTime)).toBeGreaterThan(now);
      expect(Date.parse(token.expireTime)).toBeGreaterThan(
        Date.parse(token.newSessionExpireTime),
      );
      expect(geminiRequests).toEqual([
        {
          uses: 1,
          expireTime: expect.any(String),
          newSessionExpireTime: expect.any(String),
          bidiGenerateContentSetup: {
            model: SESSION_TOKEN_LIVE_MODEL,
            generationConfig: {
              responseModalities: buildGeminiLiveConnectCapabilityConfig().responseModalities,
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            sessionResumption: {},
          },
        },
      ]);
    } finally {
      fetchSpy.mockRestore();
      await harness.app.close();
    }
  });

  it('uses the local default desktop auth configuration when no env override is set', async () => {
    delete process.env['SESSION_TOKEN_AUTH_SECRET'];
    const harness = await createTokenApp({
      sessionServiceOverride: {
        createEphemeralToken: jest.fn().mockResolvedValue({
          token: 'ephemeral-token',
          expireTime: '2099-03-09T12:30:00.000Z',
          newSessionExpireTime: '2099-03-09T12:01:30.000Z',
        }),
      },
    });

    try {
      const client = await createDesktopBackendClient(
        harness.baseUrl,
        createDesktopFetch(originalFetch),
      );

      await expect(client.requestSessionToken({})).resolves.toEqual({
        token: 'ephemeral-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      });
    } finally {
      await harness.app.close();
    }
  });

  it('surfaces invalid desktop auth configuration as a safe 403', async () => {
    const harness = await createTokenApp();
    process.env['SESSION_TOKEN_AUTH_SECRET'] = 'wrong-secret';

    try {
      const client = await createDesktopBackendClient(
        harness.baseUrl,
        createDesktopFetch(originalFetch),
      );

      await expect(client.requestSessionToken({})).rejects.toThrow(
        'Token request failed: 403 - Session token credential is invalid',
      );
    } finally {
      await harness.app.close();
    }
  });

  it('surfaces backend rate limiting as a safe 429', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
      ((input: string | URL | Request, init?: RequestInit) => {
        if (typeof input === 'string' && input === GEMINI_AUTH_TOKEN_URL) {
          return Promise.resolve(
            new Response(JSON.stringify({ name: 'auth-tokens/live-token' }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }

        return originalFetch(input as never, init);
      }) as typeof fetch,
    );
    const harness = await createTokenApp({ sessionTokenRateLimitMaxRequests: 2 });

    try {
      const client = await createDesktopBackendClient(
        harness.baseUrl,
        createDesktopFetch(originalFetch),
      );

      await expect(client.requestSessionToken({ sessionId: 'session-1' })).resolves.toEqual(
        expect.objectContaining({ token: 'auth-tokens/live-token' }),
      );
      await expect(client.requestSessionToken({ sessionId: 'session-2' })).resolves.toEqual(
        expect.objectContaining({ token: 'auth-tokens/live-token' }),
      );
      await expect(client.requestSessionToken({ sessionId: 'session-3' })).rejects.toThrow(
        'Token request failed: 429 - Session token rate limit exceeded',
      );
    } finally {
      fetchSpy.mockRestore();
      await harness.app.close();
    }
  });

  it('surfaces upstream provisioning failure as a safe 502', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
      ((input: string | URL | Request, init?: RequestInit) => {
        if (typeof input === 'string' && input === GEMINI_AUTH_TOKEN_URL) {
          return Promise.reject(new Error('network down'));
        }

        return originalFetch(input as never, init);
      }) as typeof fetch,
    );
    const harness = await createTokenApp();

    try {
      const client = await createDesktopBackendClient(
        harness.baseUrl,
        createDesktopFetch(originalFetch),
      );

      await expect(client.requestSessionToken({})).rejects.toThrow(
        'Token request failed: 502 - Gemini token provisioning failed',
      );
    } finally {
      fetchSpy.mockRestore();
      await harness.app.close();
    }
  });

  it('rejects expired token responses returned by the backend before session bootstrap', async () => {
    const harness = await createTokenApp({
      sessionServiceOverride: {
        createEphemeralToken: async () => ({
          token: 'auth-tokens/expired-token',
          expireTime: '2026-03-09T12:30:00.000Z',
          newSessionExpireTime: '2026-03-09T11:59:59.000Z',
        }),
      },
    });

    try {
      jest.useFakeTimers().setSystemTime(new Date('2026-03-09T12:00:00.000Z'));
      const client = await createDesktopBackendClient(
        harness.baseUrl,
        createDesktopFetch(originalFetch),
      );

      await expect(client.requestSessionToken({})).rejects.toThrow(
        'Token response was expired before Live connect',
      );
    } finally {
      jest.useRealTimers();
      await harness.app.close();
    }
  });
});
