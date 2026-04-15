export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

export type ChatId = string;

export interface ChatRecord {
  id: ChatId;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  isCurrent: boolean;
}

export type ChatMessageRole = 'user' | 'assistant';

export type AnswerProvenance =
  | 'project_grounded'
  | 'web_grounded'
  | 'tool_grounded'
  | 'unverified';

export type AnswerConfidence = 'low' | 'medium' | 'high';

export interface AnswerCitation {
  label: string;
  uri?: string;
}

export interface AnswerMetadata {
  provenance: AnswerProvenance;
  citations?: AnswerCitation[];
  confidence?: AnswerConfidence;
  reason?: string;
  thinkingText?: string;
}

export interface ChatMessageRecord {
  id: string;
  chatId: ChatId;
  role: ChatMessageRole;
  contentText: string;
  answerMetadata?: AnswerMetadata;
  createdAt: string;
  sequence: number;
}

export interface RehydrationPacketTurn {
  role: ChatMessageRole;
  kind: 'message';
  text: string;
  createdAt: string;
  sequence: number;
}

export interface RehydrationPacketStateEntry {
  key: string;
  value: string;
}

export interface RehydrationPacketStateSection {
  entries: RehydrationPacketStateEntry[];
}

export interface RehydrationPacketContextState {
  task: RehydrationPacketStateSection;
  context: RehydrationPacketStateSection;
}

export interface RehydrationPacket {
  stableInstruction: string;
  summary: string | null;
  recentTurns: RehydrationPacketTurn[];
  contextState: RehydrationPacketContextState;
}

export interface CreateChatRequest {
  title?: string | null;
}

export interface AppendChatMessageRequest {
  chatId: ChatId;
  role: ChatMessageRole;
  contentText: string;
  answerMetadata?: AnswerMetadata;
}

export interface ChatMemoryListOptions {
  limit?: number;
}

export interface DurableChatSummaryRecord {
  chatId: ChatId;
  schemaVersion: number;
  source: string;
  summaryText: string;
  coveredThroughSequence: number;
  updatedAt: string;
}

export type LiveSessionId = string;
export const ASSISTANT_VOICES = ['Puck', 'Kore', 'Aoede'] as const;
export type AssistantVoice = typeof ASSISTANT_VOICES[number];
export const DEFAULT_ASSISTANT_VOICE: AssistantVoice = ASSISTANT_VOICES[0];
export const DEFAULT_SYSTEM_INSTRUCTION =
  'You are Livepair, a realtime multimodal desktop assistant.';
export const MAX_SYSTEM_INSTRUCTION_LENGTH = 1200;
export const SESSION_ID_MAX_LENGTH = 128;
// Permit URL-safe identifier characters: alphanumerics plus dash and underscore.
export const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
export const LIVE_MEDIA_RESOLUTIONS = [
  'MEDIA_RESOLUTION_LOW',
  'MEDIA_RESOLUTION_MEDIUM',
  'MEDIA_RESOLUTION_HIGH',
] as const;
export type LiveMediaResolution = typeof LIVE_MEDIA_RESOLUTIONS[number];
export type VoiceToolName =
  | 'get_current_mode'
  | 'get_voice_session_status'
  | 'search_project_knowledge';

export type VoiceToolDeclaration = {
  name: VoiceToolName;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
};

const BASE_VOICE_TOOL_DECLARATIONS: readonly VoiceToolDeclaration[] = [
  {
    name: 'get_current_mode',
    description: 'Get the current assistant session mode.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'get_voice_session_status',
    description: 'Get the current voice session runtime status.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
];

const PROJECT_GROUNDING_TOOL_DECLARATIONS: readonly VoiceToolDeclaration[] = [
  {
    name: 'search_project_knowledge',
    description: 'Search curated project documents for project-specific facts, architecture, implementation details, and internal docs. Use this for repository-specific factual questions. Do not use it for current public web facts, runtime app state when a direct tool already exists, or brainstorming and stylistic opinions.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
] as const;

export type GeminiLiveToolConfig =
  | {
      functionDeclarations: readonly VoiceToolDeclaration[];
    }
  | {
      googleSearch: Record<string, never>;
    };

export const LIVE_BASE_FACTUAL_CAUTION_INSTRUCTION =
  'If you cannot verify a factual claim from provided context or tool output, say the answer is not verified.';
export const LIVE_GROUNDING_POLICY_INSTRUCTION =
  'Use provided context, built-in Google Search grounding, and explicit tool output as the source of truth for factual claims. For project-specific factual questions about this codebase, architecture, implementation details, or internal docs, call search_project_knowledge. For public or current facts that may have changed, rely on Google Search grounding instead of model memory. For runtime state, user/device/session facts, and actions, use explicit local state or tools rather than web grounding. Do not use search_project_knowledge for public web facts, direct runtime state, brainstorming, or stylistic editing. If grounding or tool evidence is weak or ambiguous, say the answer is not verified. Keep non-factual replies natural and avoid reading out source lists unless the user asks.';

export interface CreateEphemeralTokenVoiceSessionPolicy {
  voice?: AssistantVoice;
  systemInstruction?: string;
  groundingEnabled?: boolean;
  mediaResolution?: LiveMediaResolution;
  contextCompressionEnabled?: boolean;
}

export interface GeminiLiveVoiceSessionPolicyConfig {
  mediaResolution: LiveMediaResolution;
  speechConfig: {
    voiceConfig: {
      prebuiltVoiceConfig: {
        voiceName: AssistantVoice;
      };
    };
  };
  systemInstruction: string;
  contextWindowCompression?:
    | {
        slidingWindow: Record<string, never>;
      }
    | undefined;
  tools: readonly GeminiLiveToolConfig[];
}

export interface GeminiLiveVoiceConnectConfig extends GeminiLiveConnectCapabilityConfig {
  mediaResolution?: LiveMediaResolution;
  speechConfig?: GeminiLiveVoiceSessionPolicyConfig['speechConfig'];
  systemInstruction?: string;
  contextWindowCompression?: GeminiLiveVoiceSessionPolicyConfig['contextWindowCompression'];
  tools?: readonly GeminiLiveToolConfig[];
}

export function isAssistantVoice(value: unknown): value is AssistantVoice {
  return typeof value === 'string' && ASSISTANT_VOICES.some((voice) => voice === value);
}

export function resolveAssistantVoicePreference(value: unknown): AssistantVoice {
  return isAssistantVoice(value) ? value : DEFAULT_ASSISTANT_VOICE;
}

export function isLiveMediaResolution(value: unknown): value is LiveMediaResolution {
  return typeof value === 'string' && LIVE_MEDIA_RESOLUTIONS.some((resolution) => resolution === value);
}

export function normalizeSystemInstructionText(value: string): string {
  const normalized = value.trim().slice(0, MAX_SYSTEM_INSTRUCTION_LENGTH);

  return normalized.length > 0 ? normalized : DEFAULT_SYSTEM_INSTRUCTION;
}

export function resolveSystemInstructionPreference(value: unknown): string {
  return typeof value === 'string'
    ? normalizeSystemInstructionText(value)
    : DEFAULT_SYSTEM_INSTRUCTION;
}

export function composeLiveSystemInstruction(
  systemInstruction: string,
  options: {
    groundingEnabled?: boolean;
  } = {},
): string {
  if (options.groundingEnabled === false) {
    return `${systemInstruction}\n\n${LIVE_BASE_FACTUAL_CAUTION_INSTRUCTION}`;
  }

  return `${systemInstruction}\n\n${LIVE_GROUNDING_POLICY_INSTRUCTION}`;
}

export function getVoiceToolDeclarations(
  options: {
    groundingEnabled?: boolean;
  } = {},
): readonly VoiceToolDeclaration[] {
  if (options.groundingEnabled === false) {
    return BASE_VOICE_TOOL_DECLARATIONS;
  }

  return [...BASE_VOICE_TOOL_DECLARATIONS, ...PROJECT_GROUNDING_TOOL_DECLARATIONS];
}

export const VOICE_TOOL_DECLARATIONS = getVoiceToolDeclarations();

export function createGeminiLiveVoiceTools(
  options: {
    groundingEnabled?: boolean;
  } = {},
): readonly GeminiLiveToolConfig[] {
  const groundingEnabled = options.groundingEnabled ?? true;
  const tools: GeminiLiveToolConfig[] = [
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

export function isCreateEphemeralTokenSessionId(value: unknown): value is string {
  return (
    typeof value === 'string'
    && value.length <= SESSION_ID_MAX_LENGTH
    && SESSION_ID_PATTERN.test(value)
  );
}

export function isCreateEphemeralTokenVoiceSessionPolicy(
  value: unknown,
): value is CreateEphemeralTokenVoiceSessionPolicy {
  if (value === undefined) {
    return true;
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const allowedKeys = new Set([
    'voice',
    'systemInstruction',
    'groundingEnabled',
    'mediaResolution',
    'contextCompressionEnabled',
  ]);

  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      return false;
    }
  }

  return (
    (!('voice' in record) || typeof record['voice'] === 'undefined' || isAssistantVoice(record['voice']))
    && (
      !('systemInstruction' in record)
      || typeof record['systemInstruction'] === 'undefined'
      || typeof record['systemInstruction'] === 'string'
    )
    && (
      !('groundingEnabled' in record)
      || typeof record['groundingEnabled'] === 'undefined'
      || typeof record['groundingEnabled'] === 'boolean'
    )
    && (
      !('mediaResolution' in record)
      || typeof record['mediaResolution'] === 'undefined'
      || isLiveMediaResolution(record['mediaResolution'])
    )
    && (
      !('contextCompressionEnabled' in record)
      || typeof record['contextCompressionEnabled'] === 'undefined'
      || typeof record['contextCompressionEnabled'] === 'boolean'
    )
  );
}

export function buildGeminiLiveVoiceSessionPolicyConfig(
  policy: CreateEphemeralTokenVoiceSessionPolicy = {},
): GeminiLiveVoiceSessionPolicyConfig {
  const groundingEnabled = policy.groundingEnabled ?? true;
  const contextCompressionEnabled = policy.contextCompressionEnabled ?? true;
  const mediaResolution = isLiveMediaResolution(policy.mediaResolution)
    ? policy.mediaResolution
    : 'MEDIA_RESOLUTION_MEDIUM';
  const voiceName = resolveAssistantVoicePreference(policy.voice);
  const systemInstruction = composeLiveSystemInstruction(
    resolveSystemInstructionPreference(policy.systemInstruction),
    { groundingEnabled },
  );

  return {
    mediaResolution,
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName,
        },
      },
    },
    systemInstruction,
    ...(contextCompressionEnabled
      ? {
          contextWindowCompression: {
            slidingWindow: {},
          },
        }
      : {}),
    tools: createGeminiLiveVoiceTools({ groundingEnabled }),
  };
}

export type LiveSessionStatus = 'active' | 'ended' | 'failed';

export interface LiveSessionRecord {
  id: LiveSessionId;
  chatId: ChatId;
  startedAt: string;
  endedAt: string | null;
  status: LiveSessionStatus;
  endedReason: string | null;
  voice: AssistantVoice | null;
  resumptionHandle: string | null;
  lastResumptionUpdateAt: string | null;
  restorable: boolean;
  invalidatedAt: string | null;
  invalidationReason: string | null;
  summarySnapshot?: string | null;
  contextStateSnapshot?: RehydrationPacketContextState | null;
}

export interface CreateLiveSessionRequest {
  chatId: ChatId;
  voice: AssistantVoice;
  startedAt?: string;
}

export interface UpdateLiveSessionResumptionRequest {
  kind: 'resumption';
  id: LiveSessionId;
  resumptionHandle?: string | null;
  lastResumptionUpdateAt?: string | null;
  restorable?: boolean;
  invalidatedAt?: string | null;
  invalidationReason?: string | null;
}

export interface UpdateLiveSessionSnapshotRequest {
  kind: 'snapshot';
  id: LiveSessionId;
  summarySnapshot?: string | null;
  contextStateSnapshot?: RehydrationPacketContextState | null;
}

export type UpdateLiveSessionRequest =
  | UpdateLiveSessionResumptionRequest
  | UpdateLiveSessionSnapshotRequest;

export interface EndLiveSessionRequest {
  id: LiveSessionId;
  endedAt?: string;
  status: Extract<LiveSessionStatus, 'ended' | 'failed'>;
  endedReason?: string | null;
}

export interface CreateEphemeralTokenRequest {
  sessionId?: string;
  voiceSessionPolicy?: CreateEphemeralTokenVoiceSessionPolicy;
}

export interface CreateEphemeralTokenResponse {
  token: string;
  expireTime: string;
  newSessionExpireTime: string;
}

export interface GeminiLiveEffectiveVoiceSessionCapabilities {
  responseModality: 'AUDIO';
  inputAudioTranscriptionEnabled: boolean;
  outputAudioTranscriptionEnabled: boolean;
  sessionResumptionEnabled: boolean;
}

export interface GeminiLiveVoiceSessionCapabilities {
  responseModalities: readonly [GeminiLiveEffectiveVoiceSessionCapabilities['responseModality']];
  inputAudioTranscriptionEnabled: boolean;
  outputAudioTranscriptionEnabled: boolean;
  sessionResumptionEnabled: boolean;
}

export interface GeminiLiveVoiceModeConfig {
  responseModality: GeminiLiveEffectiveVoiceSessionCapabilities['responseModality'];
  inputAudioTranscription: boolean;
  outputAudioTranscription: boolean;
}

export interface GeminiLiveConnectCapabilityConfig {
  responseModalities: readonly [GeminiLiveEffectiveVoiceSessionCapabilities['responseModality']];
  inputAudioTranscription?: Record<string, never>;
  outputAudioTranscription?: Record<string, never>;
  sessionResumption?: Record<string, never>;
}

export const GEMINI_LIVE_CONSTRAINED_EFFECTIVE_VOICE_SESSION_CAPABILITIES = {
  responseModality: 'AUDIO',
  inputAudioTranscriptionEnabled: true,
  outputAudioTranscriptionEnabled: true,
  sessionResumptionEnabled: true,
} as const satisfies GeminiLiveEffectiveVoiceSessionCapabilities;

export function buildGeminiLiveVoiceSessionCapabilities(
  capabilities: GeminiLiveEffectiveVoiceSessionCapabilities =
    GEMINI_LIVE_CONSTRAINED_EFFECTIVE_VOICE_SESSION_CAPABILITIES,
): GeminiLiveVoiceSessionCapabilities {
  return {
    responseModalities: [capabilities.responseModality] as const,
    inputAudioTranscriptionEnabled: capabilities.inputAudioTranscriptionEnabled,
    outputAudioTranscriptionEnabled: capabilities.outputAudioTranscriptionEnabled,
    sessionResumptionEnabled: capabilities.sessionResumptionEnabled,
  };
}

export function buildGeminiLiveVoiceModeConfig(
  capabilities: GeminiLiveEffectiveVoiceSessionCapabilities =
    GEMINI_LIVE_CONSTRAINED_EFFECTIVE_VOICE_SESSION_CAPABILITIES,
): GeminiLiveVoiceModeConfig {
  return {
    responseModality: capabilities.responseModality,
    inputAudioTranscription: capabilities.inputAudioTranscriptionEnabled,
    outputAudioTranscription: capabilities.outputAudioTranscriptionEnabled,
  };
}

export function buildGeminiLiveConnectCapabilityConfig(
  capabilities: GeminiLiveEffectiveVoiceSessionCapabilities =
    GEMINI_LIVE_CONSTRAINED_EFFECTIVE_VOICE_SESSION_CAPABILITIES,
): GeminiLiveConnectCapabilityConfig {
  return {
    responseModalities: [capabilities.responseModality] as const,
    ...(capabilities.inputAudioTranscriptionEnabled
      ? { inputAudioTranscription: {} }
      : {}),
    ...(capabilities.outputAudioTranscriptionEnabled
      ? { outputAudioTranscription: {} }
      : {}),
    ...(capabilities.sessionResumptionEnabled
      ? { sessionResumption: {} }
      : {}),
  };
}

export const GEMINI_LIVE_CONSTRAINED_VOICE_CAPABILITIES = {
  responseModalities: [
    GEMINI_LIVE_CONSTRAINED_EFFECTIVE_VOICE_SESSION_CAPABILITIES.responseModality,
  ],
  inputAudioTranscriptionEnabled:
    GEMINI_LIVE_CONSTRAINED_EFFECTIVE_VOICE_SESSION_CAPABILITIES.inputAudioTranscriptionEnabled,
  outputAudioTranscriptionEnabled:
    GEMINI_LIVE_CONSTRAINED_EFFECTIVE_VOICE_SESSION_CAPABILITIES.outputAudioTranscriptionEnabled,
  sessionResumptionEnabled:
    GEMINI_LIVE_CONSTRAINED_EFFECTIVE_VOICE_SESSION_CAPABILITIES.sessionResumptionEnabled,
} as const satisfies GeminiLiveVoiceSessionCapabilities;

export interface ProjectKnowledgeSearchRequest {
  query: string;
}

export type ProjectKnowledgeRetrievalStatus =
  | 'grounded'
  | 'no_match'
  | 'not_ready'
  | 'failed';

export interface ProjectKnowledgeSourceReference {
  id: string;
  title: string;
  path?: string;
}

export interface ProjectKnowledgeSupportingExcerpt {
  sourceId: string;
  text: string;
}

export interface ProjectKnowledgeSearchResult {
  summaryAnswer: string;
  supportingExcerpts: ProjectKnowledgeSupportingExcerpt[];
  sources: ProjectKnowledgeSourceReference[];
  confidence: AnswerConfidence;
  retrievalStatus: ProjectKnowledgeRetrievalStatus;
  failureReason?: string;
}

export const SESSION_TOKEN_AUTH_HEADER_NAME = 'x-livepair-session-token-secret' as const;

export * from './liveTelemetry';
