import { describe, expect, it } from 'vitest';
import type { LiveConnectMode } from '../core/session.types';
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
    } satisfies Record<LiveConnectMode, {
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
        VITE_LIVE_API_VERSION: 'v1alpha',
        VITE_LIVE_VOICE_RESPONSE_MODALITY: 'AUDIO',
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
      apiVersion: 'v1alpha',
      url:
        'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained',
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

  it('requires explicit speech-mode env config', () => {
    expect(() => resolveLiveConfigEnv({})).toThrow(
      'Invalid Live config: VITE_LIVE_MODEL is required for speech mode',
    );

    expect(() =>
      resolveLiveConfigEnv({
        VITE_LIVE_MODEL: 'models/gemini-2.0-flash-live-001',
      }),
    ).toThrow('Invalid Live config: VITE_LIVE_API_VERSION is required for speech mode');

    expect(() =>
      resolveLiveConfigEnv({
        VITE_LIVE_MODEL: 'models/gemini-2.0-flash-live-001',
        VITE_LIVE_API_VERSION: 'v1alpha',
      }),
    ).toThrow(
      'Invalid Live config: VITE_LIVE_VOICE_RESPONSE_MODALITY is required for speech mode',
    );
  });

  it('keeps text-path defaults separate from speech env requirements', () => {
    const config = parseLiveConfig(
      resolveLiveConfigEnv({
        VITE_LIVE_MODEL: 'models/gemini-2.0-flash-live-001',
        VITE_LIVE_API_VERSION: 'v1alpha',
        VITE_LIVE_VOICE_RESPONSE_MODALITY: 'AUDIO',
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
      mediaResolution: 'MEDIA_RESOLUTION_MEDIUM',
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
      responseModalities: ['AUDIO'],
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
      ],
    });
  });

  it('rejects non-v1alpha speech config before transport bootstrap', () => {
    expect(() =>
      parseLiveConfig(
        resolveLiveConfigEnv({
          VITE_LIVE_MODEL: 'models/gemini-2.0-flash-live-001',
          VITE_LIVE_API_VERSION: 'v1beta',
          VITE_LIVE_VOICE_RESPONSE_MODALITY: 'AUDIO',
        }),
      ),
    ).toThrow(
      'Invalid Live config: speech mode requires VITE_LIVE_API_VERSION to be "v1alpha" for ephemeral tokens',
    );
  });
});
