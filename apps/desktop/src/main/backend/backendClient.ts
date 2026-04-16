import type {
  AssistantVoice,
  AppendChatMessageRequest,
  ChatId,
  ChatMemoryListOptions,
  ChatMessageRecord,
  ChatRecord,
  CreateChatRequest,
  CreateEphemeralTokenRequest,
  CreateEphemeralTokenResponse,
  CreateLiveSessionRequest,
  DurableChatSummaryRecord,
  EndLiveSessionRequest,
  HealthResponse,
  LiveTelemetryEvent,
  LiveSessionRecord,
  ProjectKnowledgeSearchRequest,
  ProjectKnowledgeSearchResult,
  ProjectKnowledgeSourceReference,
  ProjectKnowledgeSupportingExcerpt,
  RehydrationPacketContextState,
  UpdateChatMessageRequest,
  UpdateLiveSessionRequest,
} from '@livepair/shared-types';
import { ASSISTANT_VOICES, SESSION_TOKEN_AUTH_HEADER_NAME } from '@livepair/shared-types';
import { resolveBackendBaseUrl } from '../../shared';

type BackendClientOptions = {
  fetchImpl?: typeof fetch;
  getBackendUrl?: () => Promise<string> | string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isAssistantVoice(value: unknown): value is AssistantVoice {
  return ASSISTANT_VOICES.some((voice) => voice === value);
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
  const value = process.env['SESSION_TOKEN_AUTH_SECRET'];

  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  return value.trim();
}

function headersToRecord(headers?: RequestInit['headers']): Record<string, string> {
  if (typeof headers === 'undefined') {
    return {};
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return Object.entries(headers).reduce<Record<string, string>>((acc, [key, value]) => {
    acc[key] = typeof value === "string" ? value : value.join(', ');
    return acc;
  }, {});
}

function withProtectedRouteHeaders(
  path: string,
  headers?: RequestInit['headers'],
): Record<string, string> {
  const sessionTokenAuthSecret = readSessionTokenAuthSecret();
  if (!sessionTokenAuthSecret) {
    throw new Error(
      `Missing required SESSION_TOKEN_AUTH_SECRET for protected backend route ${path}`,
    );
  }

  return {
    ...headersToRecord(headers),
    [SESSION_TOKEN_AUTH_HEADER_NAME]: sessionTokenAuthSecret,
  };
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

function parseProjectKnowledgeSourceReference(
  value: unknown,
  errorMessage = 'Project knowledge response was invalid',
): ProjectKnowledgeSourceReference {
  if (!isPlainRecord(value)) {
    throw new Error(errorMessage);
  }

  if (
    !isNonEmptyString(value['id'])
    || !isNonEmptyString(value['title'])
    || (typeof value['path'] !== 'undefined' && !isNonEmptyString(value['path']))
  ) {
    throw new Error(errorMessage);
  }

  return {
    id: value['id'],
    title: value['title'],
    ...(typeof value['path'] === 'string' ? { path: value['path'] } : {}),
  };
}

function parseProjectKnowledgeSupportingExcerpt(
  value: unknown,
  errorMessage = 'Project knowledge response was invalid',
): ProjectKnowledgeSupportingExcerpt {
  if (!isPlainRecord(value)) {
    throw new Error(errorMessage);
  }

  if (!isNonEmptyString(value['sourceId']) || !isNonEmptyString(value['text'])) {
    throw new Error(errorMessage);
  }

  return {
    sourceId: value['sourceId'],
    text: value['text'],
  };
}

function parseProjectKnowledgeSearchResult(
  value: unknown,
): ProjectKnowledgeSearchResult {
  if (!isPlainRecord(value)) {
    throw new Error('Project knowledge response was invalid');
  }

  if (
    !isNonEmptyString(value['summaryAnswer'])
    || !Array.isArray(value['supportingExcerpts'])
    || !Array.isArray(value['sources'])
    || (value['confidence'] !== 'low' && value['confidence'] !== 'medium' && value['confidence'] !== 'high')
    || (
      value['retrievalStatus'] !== 'grounded'
      && value['retrievalStatus'] !== 'no_match'
      && value['retrievalStatus'] !== 'not_ready'
      && value['retrievalStatus'] !== 'failed'
    )
    || (typeof value['failureReason'] !== 'undefined' && !isNonEmptyString(value['failureReason']))
  ) {
    throw new Error('Project knowledge response was invalid');
  }

  return {
    summaryAnswer: value['summaryAnswer'],
    supportingExcerpts: value['supportingExcerpts'].map((item) =>
      parseProjectKnowledgeSupportingExcerpt(item),
    ),
    sources: value['sources'].map((item) => parseProjectKnowledgeSourceReference(item)),
    confidence: value['confidence'],
    retrievalStatus: value['retrievalStatus'],
    ...(typeof value['failureReason'] === 'string'
      ? { failureReason: value['failureReason'] }
      : {}),
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

function parseAnswerMetadata(
  value: unknown,
  errorMessage = 'Chat message response was invalid',
): ChatMessageRecord['answerMetadata'] {
  if (typeof value === 'undefined') {
    return undefined;
  }

  if (!isPlainRecord(value)) {
    throw new Error(errorMessage);
  }

  if (
    (value['provenance'] !== 'project_grounded'
      && value['provenance'] !== 'web_grounded'
      && value['provenance'] !== 'tool_grounded'
      && value['provenance'] !== 'unverified')
    || (
      typeof value['citations'] !== 'undefined'
      && (
        !Array.isArray(value['citations'])
        || value['citations'].some((citation) =>
          !isPlainRecord(citation)
          || !isNonEmptyString(citation['label'])
          || (typeof citation['uri'] !== 'undefined' && !isNonEmptyString(citation['uri']))
        )
      )
    )
    || (
      typeof value['confidence'] !== 'undefined'
      && value['confidence'] !== 'low'
      && value['confidence'] !== 'medium'
      && value['confidence'] !== 'high'
    )
    || (typeof value['reason'] !== 'undefined' && !isNonEmptyString(value['reason']))
    || (typeof value['thinkingText'] !== 'undefined' && !isNonEmptyString(value['thinkingText']))
  ) {
    throw new Error(errorMessage);
  }

  return {
    provenance: value['provenance'],
    ...(Array.isArray(value['citations'])
      ? {
          citations: value['citations'].map((citation) => ({
            label: citation['label'],
            ...(typeof citation['uri'] === 'string' ? { uri: citation['uri'] } : {}),
          })),
        }
      : {}),
    ...(typeof value['confidence'] === 'string' ? { confidence: value['confidence'] } : {}),
    ...(typeof value['reason'] === 'string' ? { reason: value['reason'] } : {}),
    ...(typeof value['thinkingText'] === 'string' ? { thinkingText: value['thinkingText'] } : {}),
  };
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

  const answerMetadata = parseAnswerMetadata(value['answerMetadata'], errorMessage);

  return {
    id: value['id'],
    chatId: value['chatId'],
    role: value['role'],
    contentText: value['contentText'],
    ...(answerMetadata ? { answerMetadata } : {}),
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
    !(value['voice'] === null || isAssistantVoice(value['voice'])) ||
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
    voice: value['voice'],
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
  protectedRoute?: boolean;
  statusLabel: string;
};

type OptionalJsonRequestOptions<T> = JsonRequestOptions<T>;

export type BackendClient = {
  checkHealth: () => Promise<HealthResponse>;
  requestSessionToken: (
    req: CreateEphemeralTokenRequest,
  ) => Promise<CreateEphemeralTokenResponse>;
  searchProjectKnowledge: (
    req: ProjectKnowledgeSearchRequest,
  ) => Promise<ProjectKnowledgeSearchResult>;
  reportLiveTelemetry: (events: LiveTelemetryEvent[]) => Promise<void>;
  createChat: (req?: CreateChatRequest) => Promise<ChatRecord>;
  getChat: (chatId: ChatId) => Promise<ChatRecord | null>;
  getCurrentChat: () => Promise<ChatRecord | null>;
  getOrCreateCurrentChat: () => Promise<ChatRecord>;
  listChats: () => Promise<ChatRecord[]>;
  listChatMessages: (
    chatId: ChatId,
    options?: ChatMemoryListOptions,
  ) => Promise<ChatMessageRecord[]>;
  getChatSummary: (chatId: ChatId) => Promise<DurableChatSummaryRecord | null>;
  appendChatMessage: (req: AppendChatMessageRequest) => Promise<ChatMessageRecord>;
  updateChatMessage: (req: UpdateChatMessageRequest) => Promise<ChatMessageRecord>;
  createLiveSession: (req: CreateLiveSessionRequest) => Promise<LiveSessionRecord>;
  listLiveSessions: (
    chatId: ChatId,
    options?: ChatMemoryListOptions,
  ) => Promise<LiveSessionRecord[]>;
  updateLiveSession: (req: UpdateLiveSessionRequest) => Promise<LiveSessionRecord>;
  endLiveSession: (req: EndLiveSessionRequest) => Promise<LiveSessionRecord>;
};

export function createBackendClient({
  fetchImpl = fetch,
  getBackendUrl,
}: BackendClientOptions): BackendClient {
  function appendChatMemoryListOptions(
    path: string,
    options?: ChatMemoryListOptions,
  ): string {
    if (typeof options?.limit === 'undefined') {
      return path;
    }

    const params = new URLSearchParams({
      limit: String(options.limit),
    });
    return `${path}?${params.toString()}`;
  }

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
    protectedRoute = false,
    statusLabel,
  }: JsonRequestOptions<T>): Promise<T> {
    const backendUrl = await resolveBackendUrl();
    const url = `${backendUrl}${path}`;
    const requestInit = protectedRoute
      ? {
          ...init,
          headers: withProtectedRouteHeaders(path, init?.headers),
        }
      : init;
    const response = typeof requestInit === 'undefined'
      ? await fetchImpl(url)
      : await fetchImpl(url, requestInit);

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
    protectedRoute = false,
    statusLabel,
  }: OptionalJsonRequestOptions<T>): Promise<T | null> {
    const backendUrl = await resolveBackendUrl();
    const url = `${backendUrl}${path}`;
    const requestInit = protectedRoute
      ? {
          ...init,
          headers: withProtectedRouteHeaders(path, init?.headers),
        }
      : init;
    const response = typeof requestInit === 'undefined'
      ? await fetchImpl(url)
      : await fetchImpl(url, requestInit);

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
      const hasSessionId = typeof req.sessionId === 'string' && req.sessionId.length > 0;
      console.info('[desktop:backend-client] session token request started', {
        hasSessionId,
      });

      const res = await fetchImpl(url, {
        method: 'POST',
        headers: withProtectedRouteHeaders('/session/token', {
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        const detail = await readErrorDetail(res);
        console.error('[desktop:backend-client] session token request failed', {
          status: res.status,
          detail,
        });
        throw new Error(
          detail ? `Token request failed: ${res.status} - ${detail}` : `Token request failed: ${res.status}`,
        );
      }

      const parsedResponse = parseCreateEphemeralTokenResponse(await res.json());
      console.info('[desktop:backend-client] session token request succeeded', {
        expireTime: parsedResponse.expireTime,
        newSessionExpireTime: parsedResponse.newSessionExpireTime,
        tokenLength: parsedResponse.token.length,
      });

      return parsedResponse;
    },

    async searchProjectKnowledge(
      req: ProjectKnowledgeSearchRequest,
    ): Promise<ProjectKnowledgeSearchResult> {
      return requestJson({
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req),
        },
        parse: parseProjectKnowledgeSearchResult,
        path: '/project-knowledge/search',
        protectedRoute: true,
        statusLabel: 'Project knowledge search failed',
      });
    },

    async reportLiveTelemetry(events: LiveTelemetryEvent[]): Promise<void> {
      await requestOptionalJson<undefined>({
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events }),
        },
        parse: () => undefined,
        path: '/observability/live-telemetry',
        protectedRoute: true,
        statusLabel: 'Live telemetry report failed',
      });
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
        protectedRoute: true,
        statusLabel: 'Create chat failed',
      });
    },

    async getChat(chatId: ChatId): Promise<ChatRecord | null> {
      return requestJson({
        nullOnStatus: 404,
        parse: (value) => parseChatRecord(value),
        path: `/chat-memory/chats/${chatId}`,
        protectedRoute: true,
        statusLabel: 'Get chat failed',
      });
    },

    async getCurrentChat(): Promise<ChatRecord | null> {
      return requestJson({
        nullOnStatus: 404,
        parse: (value) => parseChatRecord(value),
        path: '/chat-memory/chats/current',
        protectedRoute: true,
        statusLabel: 'Get current chat failed',
      });
    },

    async getOrCreateCurrentChat(): Promise<ChatRecord> {
      return requestJson({
        init: { method: 'PUT' },
        parse: (value) => parseChatRecord(value),
        path: '/chat-memory/chats/current',
        protectedRoute: true,
        statusLabel: 'Get or create current chat failed',
      });
    },

    async listChats(): Promise<ChatRecord[]> {
      return requestJson({
        parse: parseChatListResponse,
        path: '/chat-memory/chats',
        protectedRoute: true,
        statusLabel: 'List chats failed',
      });
    },

    async listChatMessages(
      chatId: ChatId,
      options?: ChatMemoryListOptions,
    ): Promise<ChatMessageRecord[]> {
      return requestJson({
        parse: parseChatMessageListResponse,
        path: appendChatMemoryListOptions(`/chat-memory/chats/${chatId}/messages`, options),
        protectedRoute: true,
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
        protectedRoute: true,
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
        protectedRoute: true,
        statusLabel: 'Append chat message failed',
      });
    },

    async updateChatMessage(
      req: UpdateChatMessageRequest,
    ): Promise<ChatMessageRecord> {
      return requestJson({
        init: {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req),
        },
        parse: (value) => parseChatMessageRecord(value),
        path: `/chat-memory/chats/${req.chatId}/messages/${req.id}`,
        protectedRoute: true,
        statusLabel: 'Update chat message failed',
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
        protectedRoute: true,
        statusLabel: 'Create live session failed',
      });
    },

    async listLiveSessions(
      chatId: ChatId,
      options?: ChatMemoryListOptions,
    ): Promise<LiveSessionRecord[]> {
      return requestJson({
        parse: parseLiveSessionListResponse,
        path: appendChatMemoryListOptions(`/chat-memory/chats/${chatId}/live-sessions`, options),
        protectedRoute: true,
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
        protectedRoute: true,
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
        protectedRoute: true,
        statusLabel: 'End live session failed',
      });
    },
  };
}
