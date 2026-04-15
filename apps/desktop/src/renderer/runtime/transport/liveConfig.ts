import {
  buildGeminiLiveConnectCapabilityConfig,
  buildGeminiLiveVoiceModeConfig,
  buildGeminiLiveVoiceSessionPolicyConfig,
  createGeminiLiveVoiceTools,
  type CreateEphemeralTokenRequest,
  type CreateEphemeralTokenVoiceSessionPolicy,
  type GeminiLiveToolConfig,
  type GeminiLiveEffectiveVoiceSessionCapabilities,
  isLiveMediaResolution,
  LIVE_BASE_FACTUAL_CAUTION_INSTRUCTION as SHARED_LIVE_BASE_FACTUAL_CAUTION_INSTRUCTION,
  LIVE_GROUNDING_POLICY_INSTRUCTION as SHARED_LIVE_GROUNDING_POLICY_INSTRUCTION,
  type LiveMediaResolution,
  resolveAssistantVoicePreference,
  resolveSystemInstructionPreference,
  GEMINI_LIVE_CONSTRAINED_EFFECTIVE_VOICE_SESSION_CAPABILITIES,
} from '@livepair/shared-types';
import type { LiveConnectMode } from '../core/session.types';
import {
  type DesktopVoice,
} from '../../../shared';

export const LIVE_PROVIDER = 'gemini' as const;
export const LIVE_ADAPTER_KEY = 'gemini-live' as const;
export const LIVE_BASE_FACTUAL_CAUTION_INSTRUCTION =
  SHARED_LIVE_BASE_FACTUAL_CAUTION_INSTRUCTION;
export const LIVE_GROUNDING_POLICY_INSTRUCTION =
  SHARED_LIVE_GROUNDING_POLICY_INSTRUCTION;

export type LiveApiVersion = 'v1alpha' | 'v1beta';
export type LiveResponseModality = 'TEXT' | 'AUDIO';
export type { LiveMediaResolution } from '@livepair/shared-types';

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

export type EffectiveVoiceSessionCapabilities = GeminiLiveEffectiveVoiceSessionCapabilities;

export type LiveConfigEnv = Partial<Record<
  | 'VITE_LIVE_MODEL'
  | 'VITE_LIVE_API_VERSION'
  | 'VITE_LIVE_CONTEXT_COMPRESSION',
  string
>>;

export type GeminiLiveConnectConfig = {
  responseModalities: readonly [LiveResponseModality];
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
  tools?: readonly GeminiLiveToolConfig[] | undefined;
};

// Match the first-use screen-quality selector default so transport bootstrap and UI agree.
const DEFAULT_LIVE_MODEL = 'models/gemini-2.5-flash-native-audio-preview-12-2025';
const DEFAULT_LIVE_API_VERSION = 'v1alpha';
const DEFAULT_MEDIA_RESOLUTION: LiveMediaResolution = 'MEDIA_RESOLUTION_MEDIUM';
const AUDIO_TRANSCRIPTION_DISABLED = false;

export function composeLiveSystemInstruction(
  systemInstruction: string,
  options: {
    groundingEnabled?: boolean;
  } = {},
): string {
  return buildGeminiLiveVoiceSessionPolicyConfig({
    systemInstruction,
    ...(options.groundingEnabled === undefined
      ? {}
      : { groundingEnabled: options.groundingEnabled }),
  }).systemInstruction;
}

export function createVoiceModeTools(
  options: {
    groundingEnabled?: boolean;
  } = {},
): NonNullable<GeminiLiveConnectConfig['tools']> {
  return createGeminiLiveVoiceTools(options);
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
  if (isLiveMediaResolution(value)) {
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
  env: LiveConfigEnv,
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
      voice: buildGeminiLiveVoiceModeConfig(),
    },
    mediaResolution: DEFAULT_MEDIA_RESOLUTION,
    sessionResumptionEnabled:
      GEMINI_LIVE_CONSTRAINED_EFFECTIVE_VOICE_SESSION_CAPABILITIES.sessionResumptionEnabled,
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
    sessionResumptionEnabled:
      rawConfig.sessionResumptionEnabled ??
      GEMINI_LIVE_CONSTRAINED_EFFECTIVE_VOICE_SESSION_CAPABILITIES.sessionResumptionEnabled,
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
    mediaResolutionOverride?: LiveMediaResolution | undefined;
  } = {},
): GeminiLiveConnectConfig {
  if (config.apiVersion !== 'v1alpha') {
    throw createConfigError(
      'Gemini Live ephemeral-token sessions require VITE_LIVE_API_VERSION to be "v1alpha"',
    );
  }

  const modeConfig = config.sessionModes[mode];
  const liveConnectConfig: GeminiLiveConnectConfig =
    mode === 'voice'
      ? {
          ...buildGeminiLiveConnectCapabilityConfig(getEffectiveVoiceSessionCapabilities(config)),
          ...buildGeminiLiveVoiceSessionPolicyConfig(
            buildGeminiLiveVoiceSessionTokenPolicy(config, options),
          ),
        }
      : {
          responseModalities: [modeConfig.responseModality],
        };

  if (mode === 'voice' || config.mediaResolution !== DEFAULT_MEDIA_RESOLUTION) {
    liveConnectConfig.mediaResolution = options.mediaResolutionOverride ?? config.mediaResolution;
  }

  if (mode === 'voice' && config.sessionResumptionEnabled) {
    liveConnectConfig.sessionResumption = options.resumeHandle
      ? {
          handle: options.resumeHandle,
        }
      : {};
  }

  if (mode === 'voice' && !options.resumeHandle) {
    return liveConnectConfig;
  }

  if (mode === 'voice') {
    delete liveConnectConfig.speechConfig;
    delete liveConnectConfig.systemInstruction;
  }

  return liveConnectConfig;
}

export function buildGeminiLiveVoiceSessionTokenPolicy(
  config: LiveConfig,
  options: {
    voice?: DesktopVoice | undefined;
    systemInstruction?: string | undefined;
    groundingEnabled?: boolean | undefined;
    mediaResolutionOverride?: LiveMediaResolution | undefined;
  } = {},
): CreateEphemeralTokenVoiceSessionPolicy {
  return {
    voice: resolveAssistantVoicePreference(options.voice),
    systemInstruction: resolveSystemInstructionPreference(options.systemInstruction),
    groundingEnabled: options.groundingEnabled ?? true,
    mediaResolution: options.mediaResolutionOverride ?? config.mediaResolution,
    contextCompressionEnabled: config.contextCompressionEnabled,
  };
}

export function buildGeminiLiveVoiceSessionTokenRequest(
  config: LiveConfig,
  options: {
    sessionId?: string | undefined;
    voice?: DesktopVoice | undefined;
    systemInstruction?: string | undefined;
    groundingEnabled?: boolean | undefined;
    mediaResolutionOverride?: LiveMediaResolution | undefined;
  } = {},
): CreateEphemeralTokenRequest {
  return {
    ...(typeof options.sessionId === 'string' ? { sessionId: options.sessionId } : {}),
    voiceSessionPolicy: buildGeminiLiveVoiceSessionTokenPolicy(config, options),
  };
}

export function getEffectiveVoiceSessionCapabilities(
  config: LiveConfig,
): EffectiveVoiceSessionCapabilities {
  const voiceMode = config.sessionModes.voice;

  return {
    responseModality:
      voiceMode.responseModality as EffectiveVoiceSessionCapabilities['responseModality'],
    inputAudioTranscriptionEnabled: voiceMode.inputAudioTranscription,
    outputAudioTranscriptionEnabled: voiceMode.outputAudioTranscription,
    sessionResumptionEnabled: config.sessionResumptionEnabled,
  };
}

let cachedLiveConfig: LiveConfig | null = null;
let configuredLiveConfigEnv: LiveConfigEnv | null = null;

export function configureLiveConfigEnv(env: LiveConfigEnv): void {
  configuredLiveConfigEnv = env;
  cachedLiveConfig = null;
}

export function getLiveConfig(): LiveConfig {
  if (!cachedLiveConfig) {
    cachedLiveConfig = parseLiveConfig(resolveLiveConfigEnv(configuredLiveConfigEnv ?? {}));
  }

  return cachedLiveConfig;
}

export function resetLiveConfigForTests(): void {
  cachedLiveConfig = null;
  configuredLiveConfigEnv = null;
}
