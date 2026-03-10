import { describe, expect, it } from 'vitest';
import type { SessionMode } from './types';
import {
  LIVE_ADAPTER_KEY,
  LIVE_PROVIDER,
  buildGeminiLiveConnectConfig,
  parseLiveConfig,
  resolveLiveConfigEnv,
} from './liveConfig';

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
      voice: {
        responseModality: 'AUDIO',
        inputAudioTranscription: false,
        outputAudioTranscription: false,
      },
    } satisfies Record<SessionMode, {
      responseModality: 'TEXT' | 'AUDIO';
      inputAudioTranscription: boolean;
      outputAudioTranscription: boolean;
    }>,
    mediaResolution: 'MEDIA_RESOLUTION_LOW',
    sessionResumptionEnabled: false,
    contextCompressionEnabled: false,
    ...overrides,
  };
}

describe('liveConfig', () => {
  it('loads valid config from env overrides', () => {
    const config = parseLiveConfig(
      resolveLiveConfigEnv({
        VITE_LIVE_MODEL: 'models/gemini-2.0-flash-live-001',
        VITE_LIVE_API_VERSION: 'v1beta',
        VITE_LIVE_INPUT_AUDIO_TRANSCRIPTION: 'true',
        VITE_LIVE_OUTPUT_AUDIO_TRANSCRIPTION: 'true',
        VITE_LIVE_MEDIA_RESOLUTION: 'MEDIA_RESOLUTION_MEDIUM',
        VITE_LIVE_SESSION_RESUMPTION: 'true',
        VITE_LIVE_CONTEXT_COMPRESSION: 'true',
      }),
    );

    expect(config).toMatchObject({
      provider: LIVE_PROVIDER,
      adapterKey: LIVE_ADAPTER_KEY,
      model: 'models/gemini-2.0-flash-live-001',
      apiVersion: 'v1beta',
      url:
        'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent',
      mediaResolution: 'MEDIA_RESOLUTION_MEDIUM',
      sessionResumptionEnabled: true,
      contextCompressionEnabled: true,
    });
    expect(config.sessionModes.voice).toEqual({
      responseModality: 'AUDIO',
      inputAudioTranscription: true,
      outputAudioTranscription: true,
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
  });

  it('applies explicit defaults for omitted env overrides', () => {
    const config = parseLiveConfig(resolveLiveConfigEnv({}));

    expect(config).toMatchObject({
      provider: LIVE_PROVIDER,
      adapterKey: LIVE_ADAPTER_KEY,
      model: 'models/gemini-2.0-flash-exp',
      apiVersion: 'v1alpha',
      mediaResolution: 'MEDIA_RESOLUTION_LOW',
      sessionResumptionEnabled: false,
      contextCompressionEnabled: false,
    });
    expect(buildGeminiLiveConnectConfig(config, 'text')).toEqual({
      responseModalities: ['TEXT'],
    });
  });

  it('rejects non-v1alpha config when building SDK bootstrap config for ephemeral tokens', () => {
    const config = parseLiveConfig(
      createRawLiveConfig({
        apiVersion: 'v1beta',
      }),
    );

    expect(() => buildGeminiLiveConnectConfig(config, 'text')).toThrow(
      'Gemini Live ephemeral-token sessions require VITE_LIVE_API_VERSION to be "v1alpha"',
    );
  });

  it('maps optional text-mode SDK connect settings from centralized config', () => {
    const config = parseLiveConfig(
      createRawLiveConfig({
        mediaResolution: 'MEDIA_RESOLUTION_MEDIUM',
        sessionResumptionEnabled: true,
        contextCompressionEnabled: true,
      }),
    );

    expect(buildGeminiLiveConnectConfig(config, 'text')).toEqual({
      responseModalities: ['TEXT'],
      mediaResolution: 'MEDIA_RESOLUTION_MEDIUM',
      sessionResumption: {},
      contextWindowCompression: {
        slidingWindow: {},
      },
    });
  });
});
