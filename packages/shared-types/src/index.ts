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

export type LiveSessionStatus = 'active' | 'ended' | 'failed';

export interface LiveSessionRecord {
  id: LiveSessionId;
  chatId: ChatId;
  startedAt: string;
  endedAt: string | null;
  status: LiveSessionStatus;
  endedReason: string | null;
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
