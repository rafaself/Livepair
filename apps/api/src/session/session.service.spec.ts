import 'reflect-metadata';
import {
  buildGeminiLiveConnectCapabilityConfig,
  buildGeminiLiveVoiceSessionPolicyConfig,
  GEMINI_LIVE_CONSTRAINED_EFFECTIVE_VOICE_SESSION_CAPABILITIES,
  MAX_SYSTEM_INSTRUCTION_LENGTH,
} from '@livepair/shared-types';
import { GEMINI_LIVE_AUTH_TOKEN_FIELD_MASK } from './gemini-auth-token.client';
// Prevent the root env loader from re-reading .env on each jest.resetModules()
// re-import of env.ts, which would restore deleted process.env vars from disk.
jest.mock('../config/loadRootEnv', () => ({}));

describe('SessionService', () => {
  const originalEnv = process.env;
  let consoleInfoSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers().setSystemTime(new Date('2026-03-09T12:00:00.000Z'));
    process.env = {
      ...originalEnv,
      GEMINI_API_KEY: 'gemini-key',
      SESSION_TOKEN_LIVE_MODEL: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
      EPHEMERAL_TOKEN_TTL_SECONDS: '60',
    };
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env = originalEnv;
    consoleInfoSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  async function createSessionService() {
    const { SessionService } = await import('./session.service');
    const { ObservabilityService } = await import('../observability/observability.service');

    const geminiAuthTokenClient = {
      createToken: jest.fn().mockResolvedValue({
        token: 'auth-tokens/constrained-token',
      }),
    };
    const observabilityService = new ObservabilityService();

    return {
      service: new SessionService(
        geminiAuthTokenClient as never,
        observabilityService,
      ),
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
      fieldMask: GEMINI_LIVE_AUTH_TOKEN_FIELD_MASK,
      liveConnectConstraints: {
        model: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          ...buildGeminiLiveConnectCapabilityConfig(),
          ...buildGeminiLiveVoiceSessionPolicyConfig(),
        },
      },
    });
  });

  it('uses the default constrained Live model when the env override is absent', async () => {
    delete process.env['SESSION_TOKEN_LIVE_MODEL'];

    const { service, createToken } = await createSessionService();

    await expect(service.createEphemeralToken({})).resolves.toEqual({
      token: 'auth-tokens/constrained-token',
      expireTime: '2026-03-09T12:30:00.000Z',
      newSessionExpireTime: '2026-03-09T12:01:00.000Z',
    });
    expect(createToken).toHaveBeenCalledWith(
      expect.objectContaining({
        liveConnectConstraints: expect.objectContaining({
          model: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
        }),
      }),
    );
  });

  it('passes through a custom voice session policy into the constrained token setup', async () => {
    const { service, createToken } = await createSessionService();

    await service.createEphemeralToken({
      voiceSessionPolicy: {
        voice: 'Aoede',
        systemInstruction: 'Answer in short bullets.',
        groundingEnabled: false,
        mediaResolution: 'MEDIA_RESOLUTION_HIGH',
        contextCompressionEnabled: false,
      },
    });

    expect(createToken).toHaveBeenCalledWith(
      expect.objectContaining({
        liveConnectConstraints: {
          model: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
          config: {
            ...buildGeminiLiveConnectCapabilityConfig(),
            ...buildGeminiLiveVoiceSessionPolicyConfig({
              voice: 'Aoede',
              systemInstruction: 'Answer in short bullets.',
              groundingEnabled: false,
              mediaResolution: 'MEDIA_RESOLUTION_HIGH',
              contextCompressionEnabled: false,
            }),
          },
        },
      }),
    );
  });

  it.each([
    { groundingEnabled: true, expectedSearchRouting: true },
    { groundingEnabled: false, expectedSearchRouting: false },
  ])(
    'keeps the final token systemInstruction within budget when groundingEnabled=$groundingEnabled',
    async ({ groundingEnabled, expectedSearchRouting }) => {
      const { service, createToken } = await createSessionService();

      await service.createEphemeralToken({
        voiceSessionPolicy: {
          groundingEnabled,
          systemInstruction: 'x'.repeat(MAX_SYSTEM_INSTRUCTION_LENGTH + 200),
        },
      });

      const tokenRequest = createToken.mock.calls[0]?.[0];
      expect(tokenRequest).toBeDefined();

      const systemInstruction = tokenRequest?.liveConnectConstraints.config.systemInstruction;

      expect(systemInstruction).toBeDefined();
      expect(systemInstruction).toHaveLength(MAX_SYSTEM_INSTRUCTION_LENGTH);
      if (expectedSearchRouting) {
        expect(systemInstruction).toContain('search_project_knowledge');
        expect(systemInstruction).toContain('Google Search');
      } else {
        expect(systemInstruction).not.toContain('search_project_knowledge');
        expect(systemInstruction).not.toContain('Google Search');
      }
    },
  );

  it('logs the issued constrained capability profile in a compact structured diagnostic', async () => {
    const { service } = await createSessionService();

    await service.createEphemeralToken({});

    expect(consoleInfoSpy).toHaveBeenCalledWith(
      '[session:token] issued',
      expect.objectContaining({
        constraintModel: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
        capabilities: GEMINI_LIVE_CONSTRAINED_EFFECTIVE_VOICE_SESSION_CAPABILITIES,
        sessionIdProvided: false,
        voiceSessionPolicyProvided: false,
      }),
    );
  });
});
