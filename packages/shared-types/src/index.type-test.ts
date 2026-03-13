import type {
  AppendChatMessageRequest,
  ChatId,
  ChatMessageRecord,
  ChatMessageRole,
  ChatRecord,
  CreateChatRequest,
  CreateEphemeralTokenRequest,
  CreateEphemeralTokenResponse,
  CreateLiveSessionRequest,
  EndLiveSessionRequest,
  HealthResponse,
  LiveSessionRecord,
  LiveSessionStatus,
  UpdateLiveSessionRequest,
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
type _ChatIdShape = Assert<
  IsExact<ChatId, string>
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
      createdAt: string;
      sequence: number;
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
type _LiveSessionStatusShape = Assert<
  IsExact<LiveSessionStatus, 'active' | 'ended' | 'failed'>
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
    {
      id: string;
      resumptionHandle?: string | null;
      lastResumptionUpdateAt?: string | null;
      restorable?: boolean;
      invalidatedAt?: string | null;
      invalidationReason?: string | null;
    }
  >
>;

export const typeAssertionsAreCompiled = true;
