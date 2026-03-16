import type {
  AnswerCitation,
  AnswerConfidence,
  AnswerMetadata,
  AnswerProvenance,
  AppendChatMessageRequest,
  ChatId,
  ChatMemoryListOptions,
  ChatMessageRecord,
  ChatMessageRole,
  ChatRecord,
  CreateChatRequest,
  DurableChatSummaryRecord,
  CreateEphemeralTokenRequest,
  CreateEphemeralTokenResponse,
  CreateLiveSessionRequest,
  GeminiLiveConnectCapabilityConfig,
  GeminiLiveEffectiveVoiceSessionCapabilities,
  GeminiLiveVoiceModeConfig,
  EndLiveSessionRequest,
  GeminiLiveVoiceSessionCapabilities,
  HealthResponse,
  LiveSessionId,
  LiveSessionRecord,
  LiveSessionStatus,
  LiveTelemetryBaseEvent,
  LiveTelemetryEvent,
  LiveTelemetryEventType,
  LiveTelemetrySessionConnectedEvent,
  LiveTelemetrySessionEndedEvent,
  LiveTelemetrySessionErrorEvent,
  LiveTelemetrySessionResumedEvent,
  LiveTelemetrySessionStartedEvent,
  LiveTelemetryUsageReportedEvent,
  ProjectKnowledgeRetrievalStatus,
  ProjectKnowledgeSearchRequest,
  ProjectKnowledgeSearchResult,
  ProjectKnowledgeSourceReference,
  ProjectKnowledgeSupportingExcerpt,
  RehydrationPacket,
  UpdateLiveSessionRequest,
} from './index';
import {
  buildGeminiLiveConnectCapabilityConfig,
  buildGeminiLiveVoiceModeConfig,
  buildGeminiLiveVoiceSessionCapabilities,
  GEMINI_LIVE_CONSTRAINED_VOICE_CAPABILITIES,
  GEMINI_LIVE_CONSTRAINED_EFFECTIVE_VOICE_SESSION_CAPABILITIES,
  SESSION_TOKEN_AUTH_HEADER_NAME,
} from './index';

type Assert<T extends true> = T;
type IsExact<T, U> =
  (<G>() => G extends T ? 1 : 2) extends
  (<G>() => G extends U ? 1 : 2) ? true : false;

type _HealthShape = Assert<
  IsExact<HealthResponse, { status: 'ok'; timestamp: string }>
>;
type _RequestShape = Assert<
  IsExact<CreateEphemeralTokenRequest, { sessionId?: string }>
>;
type _ResponseToken = Assert<
  IsExact<CreateEphemeralTokenResponse['token'], string>
>;
type _ResponseExpireTime = Assert<
  IsExact<CreateEphemeralTokenResponse['expireTime'], string>
>;
type _ResponseNewSessionExpireTime = Assert<
  IsExact<CreateEphemeralTokenResponse['newSessionExpireTime'], string>
>;
type _GeminiLiveVoiceSessionCapabilitiesShape = Assert<
  IsExact<
    GeminiLiveVoiceSessionCapabilities,
    {
      responseModalities: readonly ['AUDIO'];
      inputAudioTranscriptionEnabled: boolean;
      outputAudioTranscriptionEnabled: boolean;
      sessionResumptionEnabled: boolean;
    }
  >
>;
type _ConstrainedGeminiLiveVoiceCapabilities = Assert<
  IsExact<
    typeof GEMINI_LIVE_CONSTRAINED_VOICE_CAPABILITIES,
    {
      readonly responseModalities: readonly ['AUDIO'];
      readonly inputAudioTranscriptionEnabled: true;
      readonly outputAudioTranscriptionEnabled: true;
      readonly sessionResumptionEnabled: true;
    }
  >
>;
type _GeminiLiveEffectiveVoiceSessionCapabilitiesShape = Assert<
  IsExact<
    GeminiLiveEffectiveVoiceSessionCapabilities,
    {
      responseModality: 'AUDIO';
      inputAudioTranscriptionEnabled: boolean;
      outputAudioTranscriptionEnabled: boolean;
      sessionResumptionEnabled: boolean;
    }
  >
>;
type _ConstrainedGeminiLiveEffectiveVoiceSessionCapabilities = Assert<
  IsExact<
    typeof GEMINI_LIVE_CONSTRAINED_EFFECTIVE_VOICE_SESSION_CAPABILITIES,
    {
      readonly responseModality: 'AUDIO';
      readonly inputAudioTranscriptionEnabled: true;
      readonly outputAudioTranscriptionEnabled: true;
      readonly sessionResumptionEnabled: true;
    }
  >
>;
type _GeminiLiveVoiceModeConfigShape = Assert<
  IsExact<
    GeminiLiveVoiceModeConfig,
    {
      responseModality: 'AUDIO';
      inputAudioTranscription: boolean;
      outputAudioTranscription: boolean;
    }
  >
>;
type _GeminiLiveConnectCapabilityConfigShape = Assert<
  IsExact<
    GeminiLiveConnectCapabilityConfig,
    {
      responseModalities: readonly ['AUDIO'];
      inputAudioTranscription?: Record<string, never>;
      outputAudioTranscription?: Record<string, never>;
      sessionResumption?: Record<string, never>;
    }
  >
>;
type _BuildGeminiLiveVoiceModeConfigReturn = Assert<
  IsExact<
    ReturnType<typeof buildGeminiLiveVoiceModeConfig>,
    GeminiLiveVoiceModeConfig
  >
>;
type _BuildGeminiLiveVoiceSessionCapabilitiesReturn = Assert<
  IsExact<
    ReturnType<typeof buildGeminiLiveVoiceSessionCapabilities>,
    GeminiLiveVoiceSessionCapabilities
  >
>;
type _BuildGeminiLiveConnectCapabilityConfigReturn = Assert<
  IsExact<
    ReturnType<typeof buildGeminiLiveConnectCapabilityConfig>,
    GeminiLiveConnectCapabilityConfig
  >
>;
type _ProjectKnowledgeSearchRequestShape = Assert<
  IsExact<ProjectKnowledgeSearchRequest, { query: string }>
>;
type _ProjectKnowledgeRetrievalStatusShape = Assert<
  IsExact<ProjectKnowledgeRetrievalStatus, 'grounded' | 'no_match' | 'not_ready' | 'failed'>
>;
type _ProjectKnowledgeSourceReferenceShape = Assert<
  IsExact<
    ProjectKnowledgeSourceReference,
    {
      id: string;
      title: string;
      path?: string;
    }
  >
>;
type _ProjectKnowledgeSupportingExcerptShape = Assert<
  IsExact<
    ProjectKnowledgeSupportingExcerpt,
    {
      sourceId: string;
      text: string;
    }
  >
>;
type _ProjectKnowledgeSearchResultShape = Assert<
  IsExact<
    ProjectKnowledgeSearchResult,
    {
      summaryAnswer: string;
      supportingExcerpts: Array<{
        sourceId: string;
        text: string;
      }>;
      sources: Array<{
        id: string;
        title: string;
        path?: string;
      }>;
      confidence: 'low' | 'medium' | 'high';
      retrievalStatus: 'grounded' | 'no_match' | 'not_ready' | 'failed';
      failureReason?: string;
    }
  >
>;
type _SessionTokenAuthHeaderName = Assert<
  IsExact<typeof SESSION_TOKEN_AUTH_HEADER_NAME, 'x-livepair-session-token-secret'>
>;
type _LiveTelemetryEventTypeShape = Assert<
  IsExact<
    LiveTelemetryEventType,
    | 'live_session_started'
    | 'live_session_connected'
    | 'live_session_resumed'
    | 'live_session_error'
    | 'live_usage_reported'
    | 'live_session_ended'
  >
>;
type _LiveTelemetryBaseEventShape = Assert<
  IsExact<
    LiveTelemetryBaseEvent,
    {
      eventType: LiveTelemetryEventType;
      occurredAt: string;
      sessionId: string;
      chatId: string;
      environment: string;
      platform: string;
      appVersion: string;
      model: string;
    }
  >
>;
type _LiveTelemetrySessionStartedEventShape = Assert<
  IsExact<
    LiveTelemetrySessionStartedEvent,
    {
      eventType: 'live_session_started';
      occurredAt: string;
      sessionId: string;
      chatId: string;
      environment: string;
      platform: string;
      appVersion: string;
      model: string;
    }
  >
>;
type _LiveTelemetrySessionConnectedEventShape = Assert<
  IsExact<
    LiveTelemetrySessionConnectedEvent,
    {
      eventType: 'live_session_connected';
      occurredAt: string;
      sessionId: string;
      chatId: string;
      environment: string;
      platform: string;
      appVersion: string;
      model: string;
      connectLatencyMs?: number;
    }
  >
>;
type _LiveTelemetrySessionResumedEventShape = Assert<
  IsExact<
    LiveTelemetrySessionResumedEvent,
    {
      eventType: 'live_session_resumed';
      occurredAt: string;
      sessionId: string;
      chatId: string;
      environment: string;
      platform: string;
      appVersion: string;
      model: string;
      connectLatencyMs?: number;
      resumeCount?: number;
    }
  >
>;
type _LiveTelemetryUsageReportedEventShape = Assert<
  IsExact<
    LiveTelemetryUsageReportedEvent,
    {
      eventType: 'live_usage_reported';
      occurredAt: string;
      sessionId: string;
      chatId: string;
      environment: string;
      platform: string;
      appVersion: string;
      model: string;
      usage: {
        totalTokenCount?: number;
        promptTokenCount?: number;
        responseTokenCount?: number;
        inputTokenCount?: number;
        outputTokenCount?: number;
        responseTokensDetails?: Array<{
          modality: string;
          tokenCount: number;
        }>;
      };
    }
  >
>;
type _LiveTelemetrySessionErrorEventShape = Assert<
  IsExact<
    LiveTelemetrySessionErrorEvent,
    {
      eventType: 'live_session_error';
      occurredAt: string;
      sessionId: string;
      chatId: string;
      environment: string;
      platform: string;
      appVersion: string;
      model: string;
      errorCode?: string;
      errorMessage?: string;
    }
  >
>;
type _LiveTelemetrySessionEndedEventShape = Assert<
  IsExact<
    LiveTelemetrySessionEndedEvent,
    {
      eventType: 'live_session_ended';
      occurredAt: string;
      sessionId: string;
      chatId: string;
      environment: string;
      platform: string;
      appVersion: string;
      model: string;
      firstResponseLatencyMs?: number;
      durationMs?: number;
      resumeCount?: number;
      interruptionCount?: number;
      closeReason?: string;
    }
  >
>;
type _LiveTelemetryEventShape = Assert<
  IsExact<
    LiveTelemetryEvent,
    | {
        eventType: 'live_session_started';
        occurredAt: string;
        sessionId: string;
        chatId: string;
        environment: string;
        platform: string;
        appVersion: string;
        model: string;
      }
    | {
        eventType: 'live_session_connected';
        occurredAt: string;
        sessionId: string;
        chatId: string;
        environment: string;
        platform: string;
        appVersion: string;
        model: string;
        connectLatencyMs?: number;
      }
    | {
        eventType: 'live_session_resumed';
        occurredAt: string;
        sessionId: string;
        chatId: string;
        environment: string;
        platform: string;
        appVersion: string;
        model: string;
        connectLatencyMs?: number;
        resumeCount?: number;
      }
    | {
        eventType: 'live_usage_reported';
        occurredAt: string;
        sessionId: string;
        chatId: string;
        environment: string;
        platform: string;
        appVersion: string;
        model: string;
        usage: {
          totalTokenCount?: number;
          promptTokenCount?: number;
          responseTokenCount?: number;
          inputTokenCount?: number;
          outputTokenCount?: number;
          responseTokensDetails?: Array<{
            modality: string;
            tokenCount: number;
          }>;
        };
      }
    | {
        eventType: 'live_session_error';
        occurredAt: string;
        sessionId: string;
        chatId: string;
        environment: string;
        platform: string;
        appVersion: string;
        model: string;
        errorCode?: string;
        errorMessage?: string;
      }
    | {
        eventType: 'live_session_ended';
        occurredAt: string;
        sessionId: string;
        chatId: string;
        environment: string;
        platform: string;
        appVersion: string;
        model: string;
        firstResponseLatencyMs?: number;
        durationMs?: number;
        resumeCount?: number;
        interruptionCount?: number;
        closeReason?: string;
      }
  >
>;
type _ChatIdShape = Assert<
  IsExact<ChatId, string>
>;
type _ChatMemoryListOptionsShape = Assert<
  IsExact<ChatMemoryListOptions, { limit?: number }>
>;
type _ChatRecordShape = Assert<
  IsExact<
    ChatRecord,
    {
      id: string;
      title: string | null;
      createdAt: string;
      updatedAt: string;
      isCurrent: boolean;
    }
  >
>;
type _ChatMessageRoleShape = Assert<
  IsExact<ChatMessageRole, 'user' | 'assistant'>
>;
type _ChatMessageRecordShape = Assert<
  IsExact<
    ChatMessageRecord,
    {
      id: string;
      chatId: string;
      role: 'user' | 'assistant';
      contentText: string;
      answerMetadata?: {
        provenance: 'project_grounded' | 'web_grounded' | 'tool_grounded' | 'unverified';
        citations?: Array<{
          label: string;
          uri?: string;
        }>;
        confidence?: 'low' | 'medium' | 'high';
        reason?: string;
        thinkingText?: string;
      };
      createdAt: string;
      sequence: number;
    }
  >
>;
type _AnswerProvenanceShape = Assert<
  IsExact<
    AnswerProvenance,
    'project_grounded' | 'web_grounded' | 'tool_grounded' | 'unverified'
  >
>;
type _AnswerConfidenceShape = Assert<
  IsExact<AnswerConfidence, 'low' | 'medium' | 'high'>
>;
type _AnswerCitationShape = Assert<
  IsExact<
    AnswerCitation,
    {
      label: string;
      uri?: string;
    }
  >
>;
type _AnswerMetadataShape = Assert<
  IsExact<
    AnswerMetadata,
      {
        provenance: 'project_grounded' | 'web_grounded' | 'tool_grounded' | 'unverified';
        citations?: Array<{
          label: string;
          uri?: string;
        }>;
        confidence?: 'low' | 'medium' | 'high';
        reason?: string;
        thinkingText?: string;
      }
  >
>;
type _AppendChatMessageRequestShape = Assert<
  IsExact<
    AppendChatMessageRequest,
    {
      chatId: string;
      role: 'user' | 'assistant';
      contentText: string;
      answerMetadata?: {
        provenance: 'project_grounded' | 'web_grounded' | 'tool_grounded' | 'unverified';
        citations?: Array<{
          label: string;
          uri?: string;
        }>;
        confidence?: 'low' | 'medium' | 'high';
        reason?: string;
        thinkingText?: string;
      };
    }
  >
>;
type _CreateChatRequestShape = Assert<
  IsExact<
    CreateChatRequest,
    {
      title?: string | null;
    }
  >
>;
type _DurableChatSummaryRecordShape = Assert<
  IsExact<
    DurableChatSummaryRecord,
    {
      chatId: string;
      schemaVersion: number;
      source: string;
      summaryText: string;
      coveredThroughSequence: number;
      updatedAt: string;
    }
  >
>;
type _LiveSessionStatusShape = Assert<
  IsExact<LiveSessionStatus, 'active' | 'ended' | 'failed'>
>;
type _LiveSessionIdShape = Assert<
  IsExact<LiveSessionId, string>
>;
type _RehydrationPacketShape = Assert<
  IsExact<
    RehydrationPacket,
    {
      stableInstruction: string;
      summary: string | null;
      recentTurns: Array<{
        role: 'user' | 'assistant';
        kind: 'message';
        text: string;
        createdAt: string;
        sequence: number;
      }>;
      contextState: {
        task: {
          entries: Array<{
            key: string;
            value: string;
          }>;
        };
        context: {
          entries: Array<{
            key: string;
            value: string;
          }>;
        };
      };
    }
  >
>;
type _LiveSessionRecordShape = Assert<
  IsExact<
    LiveSessionRecord,
    {
      id: string;
      chatId: string;
      startedAt: string;
      endedAt: string | null;
      status: 'active' | 'ended' | 'failed';
      endedReason: string | null;
      resumptionHandle: string | null;
      lastResumptionUpdateAt: string | null;
      restorable: boolean;
      invalidatedAt: string | null;
      invalidationReason: string | null;
      summarySnapshot?: string | null;
      contextStateSnapshot?: {
        task: {
          entries: Array<{
            key: string;
            value: string;
          }>;
        };
        context: {
          entries: Array<{
            key: string;
            value: string;
          }>;
        };
      } | null;
    }
  >
>;
type _CreateLiveSessionRequestShape = Assert<
  IsExact<
    CreateLiveSessionRequest,
    {
      chatId: string;
      startedAt?: string;
    }
  >
>;
type _EndLiveSessionRequestShape = Assert<
  IsExact<
    EndLiveSessionRequest,
    {
      id: string;
      endedAt?: string;
      status: 'ended' | 'failed';
      endedReason?: string | null;
    }
  >
>;
type _UpdateLiveSessionRequestShape = Assert<
  IsExact<
    UpdateLiveSessionRequest,
    | {
        kind: 'resumption';
        id: string;
        resumptionHandle?: string | null;
        lastResumptionUpdateAt?: string | null;
        restorable?: boolean;
        invalidatedAt?: string | null;
        invalidationReason?: string | null;
      }
    | {
        kind: 'snapshot';
        id: string;
        summarySnapshot?: string | null;
        contextStateSnapshot?: {
          task: {
            entries: Array<{
              key: string;
              value: string;
            }>;
          };
          context: {
            entries: Array<{
              key: string;
              value: string;
            }>;
          };
        } | null;
      }
  >
>;

export const typeAssertionsAreCompiled = true;
