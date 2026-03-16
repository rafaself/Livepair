import { GEMINI_LIVE_CONSTRAINED_VOICE_CAPABILITIES } from '@livepair/shared-types';
import type { LiveConnectMode } from '../core/session.types';
import { getVoiceToolDeclarations } from '../voice/tools/voiceTools';
import {
  resolveDesktopVoicePreference,
  resolveSystemInstructionPreference,
  type DesktopVoice,
} from '../../../shared';

export const LIVE_PROVIDER = 'gemini' as const;
export const LIVE_ADAPTER_KEY = 'gemini-live' as const;
export const LIVE_GROUNDING_POLICY_INSTRUCTION =
  'Use provided context, built-in Google Search grounding, and explicit tool output as the source of truth for factual claims. For project-specific factual questions about this codebase, architecture, implementation details, or internal docs/specs, call search_project_knowledge. For public or current facts that may have changed, rely on Google Search grounding instead of model memory. For runtime state, user/device/session facts, and actions, use explicit local state or tools rather than web grounding. Do not use search_project_knowledge for public web facts, direct runtime state, brainstorming, or stylistic editing. If grounding or tool evidence is weak or ambiguous, say the answer is not verified. Keep non-factual replies natural and avoid reading out source lists unless the user asks.';

export type LiveApiVersion = 'v1alpha' | 'v1beta';
export type LiveResponseModality = 'TEXT' | 'AUDIO';
export type LiveMediaResolution =
  | 'MEDIA_RESOLUTION_LOW'
  | 'MEDIA_RESOLUTION_MEDIUM'
  | 'MEDIA_RESOLUTION_HIGH';

type RawLiveSessionModeConfig = {
  responseModality: string;
  inputAudioTranscription: boolean;
  outputAudioTranscription: boolean;
};

export type RawLiveConfig = {
  provider: string;
  adapterKey: string;
  model: string;
  apiVersion: string;
  sessionModes: Record<LiveConnectMode, RawLiveSessionModeConfig>;
  mediaResolution: string;
  sessionResumptionEnabled: boolean;
  contextCompressionEnabled: boolean;
};

export type LiveSessionModeConfig = {
  responseModality: LiveResponseModality;
  inputAudioTranscription: boolean;
  outputAudioTranscription: boolean;
};

export type LiveConfig = {
  provider: typeof LIVE_PROVIDER;
  adapterKey: typeof LIVE_ADAPTER_KEY;
  model: string;
  apiVersion: LiveApiVersion;
  url: string;
  sessionModes: Record<LiveConnectMode, LiveSessionModeConfig>;
  mediaResolution: LiveMediaResolution;
  sessionResumptionEnabled: boolean;
  contextCompressionEnabled: boolean;
};

type LiveConfigEnv = Partial<Record<
  | 'VITE_LIVE_MODEL'
  | 'VITE_LIVE_API_VERSION'
  | 'VITE_LIVE_MEDIA_RESOLUTION'
  | 'VITE_LIVE_CONTEXT_COMPRESSION',
  string
>>;

export type GeminiLiveConnectConfig = {
  responseModalities: [LiveResponseModality];
  inputAudioTranscription?: Record<string, never> | undefined;
  outputAudioTranscription?: Record<string, never> | undefined;
  mediaResolution?: LiveMediaResolution | undefined;
  speechConfig?:
    | {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: DesktopVoice;
          };
        };
      }
    | undefined;
  systemInstruction?: string | undefined;
  sessionResumption?:
    | {
        handle?: string;
      }
    | undefined;
  contextWindowCompression?:
    | {
        slidingWindow: Record<string, never>;
      }
    | undefined;
  tools?:
    | Array<
        | {
            functionDeclarations: ReturnType<typeof getVoiceToolDeclarations>;
          }
        | {
            googleSearch: Record<string, never>;
          }
      >
    | undefined;
};

// Conservative default for speech-mode screen sharing: optimize for latency/cost first.
const DEFAULT_LIVE_MODEL = 'models/gemini-2.5-flash-native-audio-preview-12-2025';
const DEFAULT_LIVE_API_VERSION = 'v1alpha';
const DEFAULT_MEDIA_RESOLUTION: LiveMediaResolution = 'MEDIA_RESOLUTION_LOW';
const AUDIO_TRANSCRIPTION_DISABLED = false;

export function composeLiveSystemInstruction(
  systemInstruction: string,
  options: {
    groundingEnabled?: boolean;
  } = {},
): string {
  if (options.groundingEnabled === false) {
    return systemInstruction;
  }

  return `${systemInstruction}\n\n${LIVE_GROUNDING_POLICY_INSTRUCTION}`;
}

export function createVoiceModeTools(
  options: {
    groundingEnabled?: boolean;
  } = {},
): NonNullable<GeminiLiveConnectConfig['tools']> {
  const groundingEnabled = options.groundingEnabled ?? true;
  const tools: NonNullable<GeminiLiveConnectConfig['tools']> = [
    {
      functionDeclarations: getVoiceToolDeclarations({ groundingEnabled }),
    },
  ];

  if (groundingEnabled) {
    tools.push({
      googleSearch: {},
    });
  }

  return tools;
}

function createConfigError(detail: string): Error {
  return new Error(`Invalid Live config: ${detail}`);
}

function requireEnvValue(value: string | undefined, envName: string, scope: string): string {
  const normalized = value?.trim();

  if (!normalized) {
    throw createConfigError(`${envName} is required for ${scope}`);
  }

  return normalized;
}

function parseBooleanEnv(
  value: string | undefined,
  envName: string,
  fallback: boolean,
): boolean {
  if (value === undefined || value.length === 0) {
    return fallback;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw createConfigError(`${envName} must be "true" or "false"`);
}

function buildLiveUrl(apiVersion: LiveApiVersion): string {
  if (apiVersion === 'v1beta') {
    return 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
  }

  return 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained';
}

function parseApiVersion(value: string): LiveApiVersion {
  if (value === 'v1alpha' || value === 'v1beta') {
    return value;
  }

  throw createConfigError(`Live API version "${value}" is not supported`);
}

function parseResponseModality(value: string, mode: LiveConnectMode): LiveResponseModality {
  if (value === 'TEXT' || value === 'AUDIO') {
    return value;
  }

  throw createConfigError(`Live ${mode} mode response modality "${value}" is not supported`);
}

function parseMediaResolution(value: string): LiveMediaResolution {
  if (
    value === 'MEDIA_RESOLUTION_LOW' ||
    value === 'MEDIA_RESOLUTION_MEDIUM' ||
    value === 'MEDIA_RESOLUTION_HIGH'
  ) {
    return value;
  }

  throw createConfigError(`Live media resolution "${value}" is not supported`);
}

function parseSessionModeConfig(
  mode: LiveConnectMode,
  value: RawLiveSessionModeConfig | undefined,
): LiveSessionModeConfig {
  if (!value) {
    throw createConfigError(`Live ${mode} mode config is required`);
  }

  return {
    responseModality: parseResponseModality(value.responseModality, mode),
    inputAudioTranscription: value.inputAudioTranscription,
    outputAudioTranscription: value.outputAudioTranscription,
  };
}

function validateSessionModeConfig(
  mode: LiveConnectMode,
  value: LiveSessionModeConfig,
): LiveSessionModeConfig {
  if (mode === 'text') {
    if (value.responseModality !== 'TEXT') {
      throw createConfigError('Live config text mode must use TEXT response modality');
    }

    if (value.inputAudioTranscription || value.outputAudioTranscription) {
      throw createConfigError('Live config text mode cannot enable audio transcription');
    }

    return value;
  }

  if (value.responseModality !== 'AUDIO') {
    throw createConfigError('Live config voice mode must use AUDIO response modality');
  }

  return value;
}

export function resolveLiveConfigEnv(
  env: LiveConfigEnv = import.meta.env as LiveConfigEnv,
): RawLiveConfig {
  return {
    provider: LIVE_PROVIDER,
    adapterKey: LIVE_ADAPTER_KEY,
    model: requireEnvValue(env.VITE_LIVE_MODEL ?? DEFAULT_LIVE_MODEL, 'VITE_LIVE_MODEL', 'speech mode'),
    apiVersion: requireEnvValue(
      env.VITE_LIVE_API_VERSION ?? DEFAULT_LIVE_API_VERSION,
      'VITE_LIVE_API_VERSION',
      'speech mode',
    ),
    sessionModes: {
      text: {
        responseModality: 'TEXT',
        inputAudioTranscription: AUDIO_TRANSCRIPTION_DISABLED,
        outputAudioTranscription: AUDIO_TRANSCRIPTION_DISABLED,
      },
      voice: {
        responseModality: GEMINI_LIVE_CONSTRAINED_VOICE_CAPABILITIES.responseModalities[0],
        inputAudioTranscription:
          GEMINI_LIVE_CONSTRAINED_VOICE_CAPABILITIES.inputAudioTranscriptionEnabled,
        outputAudioTranscription:
          GEMINI_LIVE_CONSTRAINED_VOICE_CAPABILITIES.outputAudioTranscriptionEnabled,
      },
    },
    mediaResolution: env.VITE_LIVE_MEDIA_RESOLUTION?.trim() || DEFAULT_MEDIA_RESOLUTION,
    sessionResumptionEnabled:
      GEMINI_LIVE_CONSTRAINED_VOICE_CAPABILITIES.sessionResumptionEnabled,
    contextCompressionEnabled: parseBooleanEnv(
      env.VITE_LIVE_CONTEXT_COMPRESSION,
      'VITE_LIVE_CONTEXT_COMPRESSION',
      true,
    ),
  };
}

export function parseLiveConfig(rawConfig: Partial<RawLiveConfig>): LiveConfig {
  if (rawConfig.provider !== LIVE_PROVIDER) {
    throw createConfigError(`Live provider must be "${LIVE_PROVIDER}"`);
  }

  if (rawConfig.adapterKey !== LIVE_ADAPTER_KEY) {
    throw createConfigError(`Live adapter key must be "${LIVE_ADAPTER_KEY}"`);
  }

  if (!rawConfig.model || rawConfig.model.trim().length === 0) {
    throw createConfigError('Live config model is required');
  }

  if (!rawConfig.model.startsWith('models/')) {
    throw createConfigError('Live config model must use the "models/..." resource format');
  }

  const apiVersion = parseApiVersion(rawConfig.apiVersion ?? '');
  if (apiVersion !== 'v1alpha') {
    throw createConfigError(
      'speech mode requires VITE_LIVE_API_VERSION to be "v1alpha" for ephemeral tokens',
    );
  }

  const sessionModes = rawConfig.sessionModes;

  if (!sessionModes) {
    throw createConfigError('Live config session modes are required');
  }

  const text = validateSessionModeConfig('text', parseSessionModeConfig('text', sessionModes.text));
  const voice = validateSessionModeConfig(
    'voice',
    parseSessionModeConfig('voice', sessionModes.voice),
  );

  return {
    provider: LIVE_PROVIDER,
    adapterKey: LIVE_ADAPTER_KEY,
    model: rawConfig.model,
    apiVersion,
    url: buildLiveUrl(apiVersion),
    sessionModes: {
      text,
      voice,
    },
    mediaResolution: parseMediaResolution(rawConfig.mediaResolution ?? ''),
    sessionResumptionEnabled: rawConfig.sessionResumptionEnabled ?? false,
    contextCompressionEnabled: rawConfig.contextCompressionEnabled ?? false,
  };
}

export function buildGeminiLiveConnectConfig(
  config: LiveConfig,
  mode: LiveConnectMode,
  options: {
    resumeHandle?: string | undefined;
    voice?: DesktopVoice | undefined;
    systemInstruction?: string | undefined;
    groundingEnabled?: boolean | undefined;
  } = {},
): GeminiLiveConnectConfig {
  if (config.apiVersion !== 'v1alpha') {
    throw createConfigError(
      'Gemini Live ephemeral-token sessions require VITE_LIVE_API_VERSION to be "v1alpha"',
    );
  }

  const modeConfig = config.sessionModes[mode];
  const groundingOptions =
    options.groundingEnabled === undefined
      ? {}
      : { groundingEnabled: options.groundingEnabled };
  const liveConnectConfig: GeminiLiveConnectConfig = {
    responseModalities: [modeConfig.responseModality],
  };

  if (modeConfig.inputAudioTranscription) {
    liveConnectConfig.inputAudioTranscription = {};
  }

  if (modeConfig.outputAudioTranscription) {
    liveConnectConfig.outputAudioTranscription = {};
  }

  if (mode === 'voice' || config.mediaResolution !== DEFAULT_MEDIA_RESOLUTION) {
    liveConnectConfig.mediaResolution = config.mediaResolution;
  }

  if (mode === 'voice' && config.sessionResumptionEnabled) {
    liveConnectConfig.sessionResumption = options.resumeHandle
      ? {
          handle: options.resumeHandle,
        }
      : {};
  }

  if (mode === 'voice' && config.contextCompressionEnabled) {
    liveConnectConfig.contextWindowCompression = {
      slidingWindow: {},
    };
  }

  if (mode === 'voice' && !options.resumeHandle) {
    liveConnectConfig.speechConfig = {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: resolveDesktopVoicePreference(options.voice),
        },
      },
    };
    liveConnectConfig.systemInstruction = composeLiveSystemInstruction(
      resolveSystemInstructionPreference(options.systemInstruction),
      groundingOptions,
    );
  }

  if (mode === 'voice') {
    liveConnectConfig.tools = createVoiceModeTools(groundingOptions);
  }

  return liveConnectConfig;
}

let cachedLiveConfig: LiveConfig | null = null;

export function getLiveConfig(): LiveConfig {
  if (!cachedLiveConfig) {
    cachedLiveConfig = parseLiveConfig(resolveLiveConfigEnv());
  }

  return cachedLiveConfig;
}

export function resetLiveConfigForTests(): void {
  cachedLiveConfig = null;
}
