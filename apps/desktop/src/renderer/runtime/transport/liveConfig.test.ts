import { describe, expect, it } from 'vitest';
import {
  buildGeminiLiveConnectCapabilityConfig,
  buildGeminiLiveVoiceModeConfig,
  GEMINI_LIVE_CONSTRAINED_EFFECTIVE_VOICE_SESSION_CAPABILITIES,
} from '@livepair/shared-types';
import type { LiveConnectMode } from '../core/session.types';
import {
  LIVE_BASE_FACTUAL_CAUTION_INSTRUCTION,
  LIVE_GROUNDING_POLICY_INSTRUCTION,
  LIVE_LOCAL_RUNTIME_POLICY_INSTRUCTION,
  LIVE_ADAPTER_KEY,
  LIVE_PROVIDER,
  buildGeminiLiveConnectConfig,
  buildGeminiLiveVoiceSessionTokenPolicy,
  buildGeminiLiveVoiceSessionTokenRequest,
  composeLiveSystemInstruction,
  createVoiceModeTools,
  getEffectiveVoiceSessionCapabilities,
  parseLiveConfig,
  resolveLiveConfigEnv,
} from './liveConfig';
import {
  DEFAULT_SYSTEM_INSTRUCTION,
  getMaxUserSystemInstructionLength,
  MAX_SYSTEM_INSTRUCTION_LENGTH,
} from '../../../shared';
import { continuousScreenQualityToMediaResolution } from './continuousScreenQuality';

function createRawLiveConfig(overrides: Partial<Parameters<typeof parseLiveConfig>[0]> = {}) {
  return {
    provider: LIVE_PROVIDER,
    adapterKey: LIVE_ADAPTER_KEY,
    model: 'models/gemini-2.0-flash-exp',
    apiVersion: 'v1alpha',
    sessionModes: {
      text: {
        responseModality: 'TEXT',
        inputAudioTranscription: false,
        outputAudioTranscription: false,
      },
      voice: buildGeminiLiveVoiceModeConfig(),
    } satisfies Record<LiveConnectMode, {
      responseModality: 'TEXT' | 'AUDIO';
      inputAudioTranscription: boolean;
      outputAudioTranscription: boolean;
    }>,
    mediaResolution: 'MEDIA_RESOLUTION_LOW',
    sessionResumptionEnabled:
      GEMINI_LIVE_CONSTRAINED_EFFECTIVE_VOICE_SESSION_CAPABILITIES.sessionResumptionEnabled,
    contextCompressionEnabled: false,
    ...overrides,
  };
}

describe('liveConfig', () => {
  it('loads valid config from env overrides', () => {
    const config = parseLiveConfig(
      resolveLiveConfigEnv({
        VITE_LIVE_MODEL: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
        VITE_LIVE_API_VERSION: 'v1alpha',
        VITE_LIVE_CONTEXT_COMPRESSION: 'true',
      }),
    );

    expect(config).toMatchObject({
      provider: LIVE_PROVIDER,
      adapterKey: LIVE_ADAPTER_KEY,
      model: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
      apiVersion: 'v1alpha',
      url:
        'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained',
      mediaResolution: 'MEDIA_RESOLUTION_MEDIUM',
      sessionResumptionEnabled:
        GEMINI_LIVE_CONSTRAINED_EFFECTIVE_VOICE_SESSION_CAPABILITIES.sessionResumptionEnabled,
      contextCompressionEnabled: true,
    });
    expect(config.sessionModes.voice).toEqual({
      ...buildGeminiLiveVoiceModeConfig(),
    });
  });

  it('rejects missing required config in parser input', () => {
    expect(() =>
      parseLiveConfig(
        createRawLiveConfig({
          model: '',
        }),
      ),
    ).toThrow('Live config model is required');
  });

  it('rejects invalid modality and mode combinations', () => {
    expect(() =>
      parseLiveConfig(
        createRawLiveConfig({
          sessionModes: {
            text: {
              responseModality: 'AUDIO',
              inputAudioTranscription: false,
              outputAudioTranscription: false,
            },
            voice: {
              responseModality: 'TEXT',
              inputAudioTranscription: false,
              outputAudioTranscription: false,
            },
          },
        }),
      ),
    ).toThrow('Live config text mode must use TEXT response modality');

    expect(() =>
      parseLiveConfig(
        createRawLiveConfig({
          sessionModes: {
            text: {
              responseModality: 'TEXT',
              inputAudioTranscription: true,
              outputAudioTranscription: false,
            },
            voice: {
              responseModality: 'AUDIO',
              inputAudioTranscription: false,
              outputAudioTranscription: false,
            },
          },
        }),
      ),
    ).toThrow('Live config text mode cannot enable audio transcription');

    expect(() =>
      parseLiveConfig(
        createRawLiveConfig({
          sessionModes: {
            text: {
              responseModality: 'TEXT',
              inputAudioTranscription: false,
              outputAudioTranscription: false,
            },
            voice: {
              responseModality: 'TEXT',
              inputAudioTranscription: false,
              outputAudioTranscription: false,
            },
          },
        }),
      ),
    ).toThrow('Live config voice mode must use AUDIO response modality');
  });

  it('uses local speech-mode defaults when env overrides are omitted', () => {
    const config = parseLiveConfig(resolveLiveConfigEnv({}));

    expect(config).toMatchObject({
      model: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
      apiVersion: 'v1alpha',
      mediaResolution: 'MEDIA_RESOLUTION_MEDIUM',
      contextCompressionEnabled: true,
    });
    expect(config.sessionModes.voice).toEqual(buildGeminiLiveVoiceModeConfig());
  });

  it('builds voice defaults from the shared constrained capability contract', () => {
    const rawConfig = resolveLiveConfigEnv({});

    expect(rawConfig.sessionModes.voice).toEqual(buildGeminiLiveVoiceModeConfig());
    expect(rawConfig.sessionResumptionEnabled).toBe(
      GEMINI_LIVE_CONSTRAINED_EFFECTIVE_VOICE_SESSION_CAPABILITIES.sessionResumptionEnabled,
    );
  });

  it('exposes explicit effective voice capabilities from centralized config', () => {
    const config = parseLiveConfig(resolveLiveConfigEnv({}));

    expect(getEffectiveVoiceSessionCapabilities(config)).toEqual(
      GEMINI_LIVE_CONSTRAINED_EFFECTIVE_VOICE_SESSION_CAPABILITIES,
    );
  });

  it('keeps text-path defaults separate from speech env requirements', () => {
    const config = parseLiveConfig(
      resolveLiveConfigEnv({
        VITE_LIVE_MODEL: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
        VITE_LIVE_API_VERSION: 'v1alpha',
      }),
    );

    expect(config.sessionModes.text).toEqual({
      responseModality: 'TEXT',
      inputAudioTranscription: false,
      outputAudioTranscription: false,
    });
  });

  it('maps optional text-mode SDK connect settings from centralized config without voice-only features', () => {
    const config = parseLiveConfig(
      createRawLiveConfig({
        mediaResolution: 'MEDIA_RESOLUTION_MEDIUM',
        sessionResumptionEnabled: true,
        contextCompressionEnabled: true,
      }),
    );

    expect(buildGeminiLiveConnectConfig(config, 'text')).toEqual({
      responseModalities: ['TEXT'],
    });
  });

  it('maps optional voice-mode SDK connect settings from centralized config', () => {
    const config = parseLiveConfig(
      createRawLiveConfig({
        mediaResolution: 'MEDIA_RESOLUTION_MEDIUM',
        sessionResumptionEnabled: true,
        contextCompressionEnabled: true,
      }),
    );

    expect(
      buildGeminiLiveConnectConfig(config, 'voice', {
        resumeHandle: 'handles/latest-voice-handle',
      }),
    ).toEqual({
      ...buildGeminiLiveConnectCapabilityConfig(),
      mediaResolution: 'MEDIA_RESOLUTION_MEDIUM',
      sessionResumption: {
        handle: 'handles/latest-voice-handle',
      },
      contextWindowCompression: {
        slidingWindow: {},
      },
      tools: [
        {
          functionDeclarations: expect.any(Array),
        },
        {
          googleSearch: {},
        },
      ],
    });
  });

  it('keeps grounded token policy and voice connect config aligned', () => {
    const config = parseLiveConfig(
      createRawLiveConfig({
        mediaResolution: 'MEDIA_RESOLUTION_MEDIUM',
        contextCompressionEnabled: true,
        sessionResumptionEnabled: true,
      }),
    );

    const options = {
      sessionId: 'session-1',
      voice: 'Kore' as const,
      systemInstruction: 'Stay concise.',
      groundingEnabled: true,
      mediaResolutionOverride: 'MEDIA_RESOLUTION_HIGH' as const,
    };
    const tokenRequest = buildGeminiLiveVoiceSessionTokenRequest(config, options);
    const tokenPolicy = buildGeminiLiveVoiceSessionTokenPolicy(config, options);

    expect(tokenRequest).toEqual({
      sessionId: 'session-1',
      voiceSessionPolicy: tokenPolicy,
    });
    expect(buildGeminiLiveConnectConfig(config, 'voice', options)).toEqual({
      ...buildGeminiLiveConnectCapabilityConfig(),
      mediaResolution: 'MEDIA_RESOLUTION_HIGH',
      sessionResumption: {},
      contextWindowCompression: {
        slidingWindow: {},
      },
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: 'Kore',
          },
        },
      },
      systemInstruction: composeLiveSystemInstruction('Stay concise.'),
      tools: [
        {
          functionDeclarations: expect.arrayContaining([
            expect.objectContaining({ name: 'search_project_knowledge' }),
          ]),
        },
        {
          googleSearch: {},
        },
      ],
    });
  });

  it('keeps ungrounded token policy and voice connect config aligned without compression', () => {
    const config = parseLiveConfig(
      createRawLiveConfig({
        mediaResolution: 'MEDIA_RESOLUTION_LOW',
        contextCompressionEnabled: false,
        sessionResumptionEnabled: true,
      }),
    );

    const options = {
      voice: 'Aoede' as const,
      systemInstruction: 'Focus on what is visible.',
      groundingEnabled: false,
    };
    const tokenRequest = buildGeminiLiveVoiceSessionTokenRequest(config, options);
    const tokenPolicy = buildGeminiLiveVoiceSessionTokenPolicy(config, options);

    expect(tokenRequest).toEqual({
      voiceSessionPolicy: tokenPolicy,
    });
    expect(tokenRequest.voiceSessionPolicy).toMatchObject({
      voice: 'Aoede',
      groundingEnabled: false,
      mediaResolution: 'MEDIA_RESOLUTION_LOW',
      contextCompressionEnabled: false,
    });
    expect(buildGeminiLiveConnectConfig(config, 'voice', options)).toEqual({
      ...buildGeminiLiveConnectCapabilityConfig(),
      mediaResolution: 'MEDIA_RESOLUTION_LOW',
      sessionResumption: {},
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: 'Aoede',
          },
        },
      },
      systemInstruction: composeLiveSystemInstruction('Focus on what is visible.', {
        groundingEnabled: false,
      }),
      tools: [
        {
          functionDeclarations: [
            expect.objectContaining({ name: 'get_current_mode' }),
            expect.objectContaining({ name: 'get_voice_session_status' }),
          ],
        },
      ],
    });
  });

  it('uses a medium mediaResolution default for voice-mode screen sharing', () => {
    const config = parseLiveConfig(resolveLiveConfigEnv({}));

    expect(buildGeminiLiveConnectConfig(config, 'voice')).toEqual({
      ...buildGeminiLiveConnectCapabilityConfig(),
      mediaResolution: 'MEDIA_RESOLUTION_MEDIUM',
      sessionResumption: {},
      contextWindowCompression: {
        slidingWindow: {},
      },
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: 'Puck',
          },
        },
      },
      systemInstruction: composeLiveSystemInstruction(DEFAULT_SYSTEM_INSTRUCTION),
      tools: [
        {
          functionDeclarations: expect.any(Array),
        },
        {
          googleSearch: {},
        },
      ],
    });
  });

  it('normalizes invalid voice and empty instructions before they reach Live config', () => {
    const config = parseLiveConfig(createRawLiveConfig());

    expect(
      buildGeminiLiveConnectConfig(config, 'voice', {
        voice: 'BadVoice' as never,
        systemInstruction: '   ',
      }),
    ).toMatchObject({
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: 'Puck',
          },
        },
      },
      systemInstruction: composeLiveSystemInstruction(DEFAULT_SYSTEM_INSTRUCTION),
    });
  });

  it('trims and caps instructions before they reach Live config', () => {
    const config = parseLiveConfig(createRawLiveConfig());
    const groundedBudget = getMaxUserSystemInstructionLength();
    const overlongInstruction = `  ${'c'.repeat(MAX_SYSTEM_INSTRUCTION_LENGTH + 20)}  `;

    const connectConfig = buildGeminiLiveConnectConfig(config, 'voice', {
      voice: 'Kore',
      systemInstruction: overlongInstruction,
    });

    expect(connectConfig).toMatchObject({
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: 'Kore',
          },
        },
      },
      systemInstruction: composeLiveSystemInstruction('c'.repeat(groundedBudget)),
    });
    expect(connectConfig.systemInstruction).toHaveLength(MAX_SYSTEM_INSTRUCTION_LENGTH);
  });

  it('keeps local runtime guidance and grounded factual policy in voice-mode system instructions', () => {
    const result = composeLiveSystemInstruction('Stay concise.');

    expect(result).toContain('Stay concise.');
    expect(result).toContain(LIVE_LOCAL_RUNTIME_POLICY_INSTRUCTION);
    expect(result).toContain(LIVE_GROUNDING_POLICY_INSTRUCTION);
    expect(result).toContain('search_project_knowledge');
    expect(result).toContain('Google Search');
    expect(result.length).toBeLessThanOrEqual(MAX_SYSTEM_INSTRUCTION_LENGTH);
    expect(LIVE_GROUNDING_POLICY_INSTRUCTION).not.toContain('user/device/session facts');
  });

  it('keeps grounding-routing out of system instruction when grounding is disabled', () => {
    const result = composeLiveSystemInstruction('Stay concise.', { groundingEnabled: false });

    expect(result).toContain('Stay concise.');
    expect(result).toContain(LIVE_LOCAL_RUNTIME_POLICY_INSTRUCTION);
    expect(result).toContain(LIVE_BASE_FACTUAL_CAUTION_INSTRUCTION);
    expect(result).not.toContain('search_project_knowledge');
    expect(result).not.toContain('Google Search');
    expect(result.length).toBeLessThanOrEqual(MAX_SYSTEM_INSTRUCTION_LENGTH);
  });

  it('preserves factual caution in system instruction even when grounding is disabled', () => {
    const result = composeLiveSystemInstruction('Stay concise.', { groundingEnabled: false });
    expect(result).toContain(LIVE_LOCAL_RUNTIME_POLICY_INSTRUCTION);
    expect(result).toContain(LIVE_BASE_FACTUAL_CAUTION_INSTRUCTION);
    expect(result).not.toContain('search_project_knowledge');
    expect(result).not.toContain('Google Search');
  });

  it('keeps built-in Google Search grounding off the text connect path', () => {
    const config = parseLiveConfig(resolveLiveConfigEnv({}));

    expect(buildGeminiLiveConnectConfig(config, 'text')).toEqual({
      responseModalities: ['TEXT'],
    });
  });

  it('omits Google Search and project retrieval tool exposure when grounding is disabled', () => {
    const config = parseLiveConfig(createRawLiveConfig());

    expect(
      buildGeminiLiveConnectConfig(config, 'voice', {
        groundingEnabled: false,
      }),
    ).toEqual({
      ...buildGeminiLiveConnectCapabilityConfig(),
      mediaResolution: 'MEDIA_RESOLUTION_LOW',
      sessionResumption: {},
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: 'Puck',
          },
        },
      },
      systemInstruction: composeLiveSystemInstruction(DEFAULT_SYSTEM_INSTRUCTION, { groundingEnabled: false }),
      tools: [
        {
          functionDeclarations: [
            expect.objectContaining({ name: 'get_current_mode' }),
            expect.objectContaining({ name: 'get_voice_session_status' }),
          ],
        },
      ],
    });
  });

  it('creates voice-mode tools with project retrieval and Google Search only when grounding is enabled', () => {
    expect(createVoiceModeTools({ groundingEnabled: true })).toEqual([
      {
        functionDeclarations: expect.arrayContaining([
          expect.objectContaining({ name: 'search_project_knowledge' }),
        ]),
      },
      {
        googleSearch: {},
      },
    ]);
    expect(createVoiceModeTools({ groundingEnabled: false })).toEqual([
      {
        functionDeclarations: [
          expect.objectContaining({ name: 'get_current_mode' }),
          expect.objectContaining({ name: 'get_voice_session_status' }),
        ],
      },
    ]);
  });

  it('wave 5: visual session quality maps correctly to media resolution values', () => {
    expect(continuousScreenQualityToMediaResolution('low')).toBe('MEDIA_RESOLUTION_LOW');
    expect(continuousScreenQualityToMediaResolution('medium')).toBe('MEDIA_RESOLUTION_MEDIUM');
    expect(continuousScreenQualityToMediaResolution('high')).toBe('MEDIA_RESOLUTION_HIGH');
  });

  it('wave 5: buildGeminiLiveConnectConfig uses quality-derived media resolution for voice mode', () => {
    const config = parseLiveConfig(
      createRawLiveConfig({
        mediaResolution: continuousScreenQualityToMediaResolution('medium'),
      }),
    );

    const connectConfig = buildGeminiLiveConnectConfig(config, 'voice');

    expect(connectConfig.mediaResolution).toBe('MEDIA_RESOLUTION_MEDIUM');
  });

  it('wave 5: buildGeminiLiveConnectConfig uses quality-derived media resolution for text mode (non-default)', () => {
    const config = parseLiveConfig(
      createRawLiveConfig({
        mediaResolution: continuousScreenQualityToMediaResolution('high'),
      }),
    );

    const connectConfig = buildGeminiLiveConnectConfig(config, 'text');

    expect(connectConfig.mediaResolution).toBe('MEDIA_RESOLUTION_HIGH');
  });

  it('wave 5: the Live model is not changed by visual session quality', () => {
    const config = parseLiveConfig(
      createRawLiveConfig({
        mediaResolution: continuousScreenQualityToMediaResolution('high'),
      }),
    );

    // model is unchanged regardless of quality setting
    expect(config.model).toBe('models/gemini-2.0-flash-exp');
  });

  it('rejects non-v1alpha speech config before transport bootstrap', () => {
    expect(() =>
      parseLiveConfig(
        resolveLiveConfigEnv({
          VITE_LIVE_MODEL: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
          VITE_LIVE_API_VERSION: 'v1beta',
        }),
      ),
    ).toThrow(
      'Invalid Live config: speech mode requires VITE_LIVE_API_VERSION to be "v1alpha" for ephemeral tokens',
    );
  });
});
