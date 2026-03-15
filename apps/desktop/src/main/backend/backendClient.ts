import type {
  AppendChatMessageRequest,
  ChatId,
  ChatMessageRecord,
  ChatRecord,
  CreateChatRequest,
  CreateEphemeralTokenRequest,
  CreateEphemeralTokenResponse,
  CreateLiveSessionRequest,
  DurableChatSummaryRecord,
  EndLiveSessionRequest,
  HealthResponse,
  LiveSessionRecord,
  RehydrationPacketContextState,
  UpdateLiveSessionRequest,
} from '@livepair/shared-types';
import { SESSION_TOKEN_AUTH_HEADER_NAME } from '@livepair/shared-types';
import { resolveBackendBaseUrl } from '../../shared';

type BackendClientOptions = {
  fetchImpl?: typeof fetch;
  getBackendUrl?: () => Promise<string> | string;
};

const DEFAULT_SESSION_TOKEN_AUTH_SECRET = 'livepair-local-session-token-secret';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isExpiredTimestamp(value: string, now = Date.now()): boolean {
  return Date.parse(value) <= now;
}

function readSessionTokenAuthSecret(): string | null {
  const value = process.env['SESSION_TOKEN_AUTH_SECRET'] ?? DEFAULT_SESSION_TOKEN_AUTH_SECRET;

  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  return value;
}

function readBackendUrlFromEnv(): string {
  return resolveBackendBaseUrl(process.env['BACKEND_URL']);
}

function isStateEntry(
  value: unknown,
): value is RehydrationPacketContextState['task']['entries'][number] {
  return (
    isPlainRecord(value)
    && typeof value['key'] === 'string'
    && typeof value['value'] === 'string'
  );
}

function isStateSection(value: unknown): value is RehydrationPacketContextState['task'] {
  return (
    isPlainRecord(value)
    && Array.isArray(value['entries'])
    && value['entries'].every((entry) => isStateEntry(entry))
  );
}

function isContextStateSnapshot(value: unknown): value is RehydrationPacketContextState {
  return (
    isPlainRecord(value)
    && isStateSection(value['task'])
    && isStateSection(value['context'])
  );
}

function parseHealthResponse(value: unknown): HealthResponse {
  if (!isPlainRecord(value)) {
    throw new Error('Health response was invalid');
  }

  if (value['status'] !== 'ok' || typeof value['timestamp'] !== 'string') {
    throw new Error('Health response was invalid');
  }

  return {
    status: 'ok',
    timestamp: value['timestamp'],
  };
}

function parseCreateEphemeralTokenResponse(
  value: unknown,
): CreateEphemeralTokenResponse {
  if (!isPlainRecord(value)) {
    throw new Error('Token response was invalid');
  }

  if (
    !isNonEmptyString(value['token']) ||
    !isValidTimestamp(value['expireTime']) ||
    !isValidTimestamp(value['newSessionExpireTime'])
  ) {
    throw new Error('Token response was invalid');
  }

  if (
    isExpiredTimestamp(value['expireTime']) ||
    isExpiredTimestamp(value['newSessionExpireTime'])
  ) {
    throw new Error('Token response was expired before Live connect');
  }

  return {
    token: value['token'],
    expireTime: value['expireTime'],
    newSessionExpireTime: value['newSessionExpireTime'],
  };
}

function parseChatRecord(
  value: unknown,
  errorMessage = 'Chat response was invalid',
): ChatRecord {
  if (!isPlainRecord(value)) {
    throw new Error(errorMessage);
  }

  if (
    !isNonEmptyString(value['id']) ||
    !isStringOrNull(value['title']) ||
    typeof value['createdAt'] !== 'string' ||
    typeof value['updatedAt'] !== 'string' ||
    typeof value['isCurrent'] !== 'boolean'
  ) {
    throw new Error(errorMessage);
  }

  return {
    id: value['id'],
    title: value['title'],
    createdAt: value['createdAt'],
    updatedAt: value['updatedAt'],
    isCurrent: value['isCurrent'],
  };
}

function parseChatListResponse(value: unknown): ChatRecord[] {
  if (!Array.isArray(value)) {
    throw new Error('Chat list response was invalid');
  }

  return value.map((item) => parseChatRecord(item, 'Chat list response was invalid'));
}

function parseChatMessageRecord(
  value: unknown,
  errorMessage = 'Chat message response was invalid',
): ChatMessageRecord {
  if (!isPlainRecord(value)) {
    throw new Error(errorMessage);
  }

  if (
    !isNonEmptyString(value['id']) ||
    !isNonEmptyString(value['chatId']) ||
    (value['role'] !== 'user' && value['role'] !== 'assistant') ||
    !isNonEmptyString(value['contentText']) ||
    typeof value['createdAt'] !== 'string' ||
    !isFiniteNumber(value['sequence'])
  ) {
    throw new Error(errorMessage);
  }

  return {
    id: value['id'],
    chatId: value['chatId'],
    role: value['role'],
    contentText: value['contentText'],
    createdAt: value['createdAt'],
    sequence: value['sequence'],
  };
}

function parseChatMessageListResponse(value: unknown): ChatMessageRecord[] {
  if (!Array.isArray(value)) {
    throw new Error('Chat message list response was invalid');
  }

  return value.map((item) =>
    parseChatMessageRecord(item, 'Chat message list response was invalid'),
  );
}

function parseChatSummaryResponse(
  value: unknown,
): DurableChatSummaryRecord | null {
  if (value === null) {
    return null;
  }

  if (!isPlainRecord(value)) {
    throw new Error('Chat summary response was invalid');
  }

  if (
    !isNonEmptyString(value['chatId']) ||
    !isFiniteNumber(value['schemaVersion']) ||
    !isNonEmptyString(value['source']) ||
    !isNonEmptyString(value['summaryText']) ||
    !isFiniteNumber(value['coveredThroughSequence']) ||
    typeof value['updatedAt'] !== 'string'
  ) {
    throw new Error('Chat summary response was invalid');
  }

  return {
    chatId: value['chatId'],
    schemaVersion: value['schemaVersion'],
    source: value['source'],
    summaryText: value['summaryText'],
    coveredThroughSequence: value['coveredThroughSequence'],
    updatedAt: value['updatedAt'],
  };
}

function parseLiveSessionRecord(
  value: unknown,
  errorMessage = 'Live session response was invalid',
): LiveSessionRecord {
  if (!isPlainRecord(value)) {
    throw new Error(errorMessage);
  }

  if (
    !isNonEmptyString(value['id']) ||
    !isNonEmptyString(value['chatId']) ||
    typeof value['startedAt'] !== 'string' ||
    !isStringOrNull(value['endedAt']) ||
    (value['status'] !== 'active' && value['status'] !== 'ended' && value['status'] !== 'failed') ||
    !isStringOrNull(value['endedReason']) ||
    !isStringOrNull(value['resumptionHandle']) ||
    !isStringOrNull(value['lastResumptionUpdateAt']) ||
    typeof value['restorable'] !== 'boolean' ||
    !isStringOrNull(value['invalidatedAt']) ||
    !isStringOrNull(value['invalidationReason'])
  ) {
    throw new Error(errorMessage);
  }

  const record: LiveSessionRecord = {
    id: value['id'],
    chatId: value['chatId'],
    startedAt: value['startedAt'],
    endedAt: value['endedAt'],
    status: value['status'],
    endedReason: value['endedReason'],
    resumptionHandle: value['resumptionHandle'],
    lastResumptionUpdateAt: value['lastResumptionUpdateAt'],
    restorable: value['restorable'],
    invalidatedAt: value['invalidatedAt'],
    invalidationReason: value['invalidationReason'],
  };

  if ('summarySnapshot' in value) {
    if (!isStringOrNull(value['summarySnapshot'])) {
      throw new Error(errorMessage);
    }

    record.summarySnapshot = value['summarySnapshot'];
  }

  if ('contextStateSnapshot' in value) {
    const contextStateSnapshot = value['contextStateSnapshot'];

    if (
      typeof contextStateSnapshot === 'undefined'
      || (
        contextStateSnapshot !== null
        && !isContextStateSnapshot(contextStateSnapshot)
      )
    ) {
      throw new Error(errorMessage);
    }

    record.contextStateSnapshot = contextStateSnapshot;
  }

  return record;
}

function parseLiveSessionListResponse(value: unknown): LiveSessionRecord[] {
  if (!Array.isArray(value)) {
    throw new Error('Live session list response was invalid');
  }

  return value.map((item) =>
    parseLiveSessionRecord(item, 'Live session list response was invalid'),
  );
}

async function readErrorDetail(response: Response): Promise<string | null> {
  try {
    const text = (await response.text()).trim();

    if (!text) {
      return null;
    }

    try {
      const payload = JSON.parse(text) as {
        message?: unknown;
        error?: { message?: unknown } | unknown;
      };

      if (typeof payload.message === 'string' && payload.message.length > 0) {
        return payload.message;
      }

      if (
        payload.error &&
        typeof payload.error === 'object' &&
        'message' in payload.error &&
        typeof payload.error.message === 'string' &&
        payload.error.message.length > 0
      ) {
        return payload.error.message;
      }
    } catch {
      return text;
    }

    return text;
  } catch {
    return null;
  }
}

type JsonRequestOptions<T> = {
  init?: RequestInit;
  nullOnStatus?: number;
  parse: (value: unknown) => T;
  path: string;
  statusLabel: string;
};

type OptionalJsonRequestOptions<T> = JsonRequestOptions<T>;

export type BackendClient = {
  checkHealth: () => Promise<HealthResponse>;
  requestSessionToken: (
    req: CreateEphemeralTokenRequest,
  ) => Promise<CreateEphemeralTokenResponse>;
  createChat: (req?: CreateChatRequest) => Promise<ChatRecord>;
  getChat: (chatId: ChatId) => Promise<ChatRecord | null>;
  getOrCreateCurrentChat: () => Promise<ChatRecord>;
  listChats: () => Promise<ChatRecord[]>;
  listChatMessages: (chatId: ChatId) => Promise<ChatMessageRecord[]>;
  getChatSummary: (chatId: ChatId) => Promise<DurableChatSummaryRecord | null>;
  appendChatMessage: (req: AppendChatMessageRequest) => Promise<ChatMessageRecord>;
  createLiveSession: (req: CreateLiveSessionRequest) => Promise<LiveSessionRecord>;
  listLiveSessions: (chatId: ChatId) => Promise<LiveSessionRecord[]>;
  updateLiveSession: (req: UpdateLiveSessionRequest) => Promise<LiveSessionRecord>;
  endLiveSession: (req: EndLiveSessionRequest) => Promise<LiveSessionRecord>;
};

export function createBackendClient({
  fetchImpl = fetch,
  getBackendUrl,
}: BackendClientOptions): BackendClient {
  async function resolveBackendUrl(): Promise<string> {
    if (typeof getBackendUrl === 'function') {
      return getBackendUrl();
    }

    return readBackendUrlFromEnv();
  }

  async function requestJson<T>({
    init,
    nullOnStatus,
    parse,
    path,
    statusLabel,
  }: JsonRequestOptions<T>): Promise<T> {
    const backendUrl = await resolveBackendUrl();
    const url = `${backendUrl}${path}`;
    const response = typeof init === 'undefined'
      ? await fetchImpl(url)
      : await fetchImpl(url, init);

    if (typeof nullOnStatus !== 'undefined' && response.status === nullOnStatus) {
      return null as T;
    }

    if (!response.ok) {
      const detail = await readErrorDetail(response);
      throw new Error(
        detail
          ? `${statusLabel}: ${response.status} - ${detail}`
          : `${statusLabel}: ${response.status}`,
      );
    }

    return parse(await response.json());
  }

  async function requestOptionalJson<T>({
    init,
    nullOnStatus,
    parse,
    path,
    statusLabel,
  }: OptionalJsonRequestOptions<T>): Promise<T | null> {
    const backendUrl = await resolveBackendUrl();
    const url = `${backendUrl}${path}`;
    const response = typeof init === 'undefined'
      ? await fetchImpl(url)
      : await fetchImpl(url, init);

    if (typeof nullOnStatus !== 'undefined' && response.status === nullOnStatus) {
      return null;
    }

    if (!response.ok) {
      const detail = await readErrorDetail(response);
      throw new Error(
        detail
          ? `${statusLabel}: ${response.status} - ${detail}`
          : `${statusLabel}: ${response.status}`,
      );
    }

    const body = (await response.text()).trim();

    if (body.length === 0) {
      return null;
    }

    return parse(JSON.parse(body));
  }

  return {
    async checkHealth(): Promise<HealthResponse> {
      return requestJson({
        parse: parseHealthResponse,
        path: '/health',
        statusLabel: 'Health check failed',
      });
    },

    async requestSessionToken(
      req: CreateEphemeralTokenRequest,
    ): Promise<CreateEphemeralTokenResponse> {
      const backendUrl = await resolveBackendUrl();
      const url = `${backendUrl}/session/token`;
      console.info('[desktop:backend-client] session token request started', {
        url,
        request: req,
      });

      const sessionTokenAuthSecret = readSessionTokenAuthSecret();
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionTokenAuthSecret
            ? { [SESSION_TOKEN_AUTH_HEADER_NAME]: sessionTokenAuthSecret }
            : {}),
        },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        const detail = await readErrorDetail(res);
        console.error('[desktop:backend-client] session token request failed', {
          url,
          status: res.status,
          detail,
        });
        throw new Error(
          detail ? `Token request failed: ${res.status} - ${detail}` : `Token request failed: ${res.status}`,
        );
      }

      const parsedResponse = parseCreateEphemeralTokenResponse(await res.json());
      console.info('[desktop:backend-client] session token request succeeded', {
        url,
        expireTime: parsedResponse.expireTime,
        newSessionExpireTime: parsedResponse.newSessionExpireTime,
        tokenLength: parsedResponse.token.length,
      });

      return parsedResponse;
    },

    async createChat(req?: CreateChatRequest): Promise<ChatRecord> {
      return requestJson({
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req ?? {}),
        },
        parse: (value) => parseChatRecord(value),
        path: '/chat-memory/chats',
        statusLabel: 'Create chat failed',
      });
    },

    async getChat(chatId: ChatId): Promise<ChatRecord | null> {
      return requestJson({
        nullOnStatus: 404,
        parse: (value) => parseChatRecord(value),
        path: `/chat-memory/chats/${chatId}`,
        statusLabel: 'Get chat failed',
      });
    },

    async getOrCreateCurrentChat(): Promise<ChatRecord> {
      return requestJson({
        init: { method: 'PUT' },
        parse: (value) => parseChatRecord(value),
        path: '/chat-memory/chats/current',
        statusLabel: 'Get or create current chat failed',
      });
    },

    async listChats(): Promise<ChatRecord[]> {
      return requestJson({
        parse: parseChatListResponse,
        path: '/chat-memory/chats',
        statusLabel: 'List chats failed',
      });
    },

    async listChatMessages(chatId: ChatId): Promise<ChatMessageRecord[]> {
      return requestJson({
        parse: parseChatMessageListResponse,
        path: `/chat-memory/chats/${chatId}/messages`,
        statusLabel: 'List chat messages failed',
      });
    },

    async getChatSummary(
      chatId: ChatId,
    ): Promise<DurableChatSummaryRecord | null> {
      return requestOptionalJson({
        nullOnStatus: 204,
        parse: parseChatSummaryResponse,
        path: `/chat-memory/chats/${chatId}/summary`,
        statusLabel: 'Get chat summary failed',
      });
    },

    async appendChatMessage(
      req: AppendChatMessageRequest,
    ): Promise<ChatMessageRecord> {
      return requestJson({
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req),
        },
        parse: (value) => parseChatMessageRecord(value),
        path: `/chat-memory/chats/${req.chatId}/messages`,
        statusLabel: 'Append chat message failed',
      });
    },

    async createLiveSession(
      req: CreateLiveSessionRequest,
    ): Promise<LiveSessionRecord> {
      return requestJson({
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req),
        },
        parse: (value) => parseLiveSessionRecord(value),
        path: `/chat-memory/chats/${req.chatId}/live-sessions`,
        statusLabel: 'Create live session failed',
      });
    },

    async listLiveSessions(chatId: ChatId): Promise<LiveSessionRecord[]> {
      return requestJson({
        parse: parseLiveSessionListResponse,
        path: `/chat-memory/chats/${chatId}/live-sessions`,
        statusLabel: 'List live sessions failed',
      });
    },

    async updateLiveSession(
      req: UpdateLiveSessionRequest,
    ): Promise<LiveSessionRecord> {
      return requestJson({
        init: {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req),
        },
        parse: (value) => parseLiveSessionRecord(value),
        path:
          req.kind === 'resumption'
            ? `/chat-memory/live-sessions/${req.id}/resumption`
            : `/chat-memory/live-sessions/${req.id}/snapshot`,
        statusLabel: 'Update live session failed',
      });
    },

    async endLiveSession(req: EndLiveSessionRequest): Promise<LiveSessionRecord> {
      return requestJson({
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req),
        },
        parse: (value) => parseLiveSessionRecord(value),
        path: `/chat-memory/live-sessions/${req.id}/end`,
        statusLabel: 'End live session failed',
      });
    },
  };
}
