// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AppendChatMessageRequest,
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
  ProjectKnowledgeSearchResult,
  UpdateLiveSessionRequest,
} from '@livepair/shared-types';
import { SESSION_TOKEN_AUTH_HEADER_NAME } from '@livepair/shared-types';
import { createBackendClient } from './backendClient';

const CHAT_ID = '11111111-1111-1111-1111-111111111111';
const MISSING_CHAT_ID = '22222222-2222-2222-2222-222222222222';
const MESSAGE_ID = '33333333-3333-3333-3333-333333333333';
const LIVE_SESSION_ID = '44444444-4444-4444-4444-444444444444';
function createChatRecord(overrides: Partial<ChatRecord> = {}): ChatRecord {
  return {
    id: CHAT_ID,
    title: null,
    createdAt: '2026-03-12T00:00:00.000Z',
    updatedAt: '2026-03-12T00:00:00.000Z',
    isCurrent: true,
    ...overrides,
  };
}

function createChatMessageRecord(
  overrides: Partial<ChatMessageRecord> = {},
): ChatMessageRecord {
  return {
    id: MESSAGE_ID,
    chatId: CHAT_ID,
    role: 'user',
    contentText: 'Hello',
    createdAt: '2026-03-12T00:00:00.000Z',
    sequence: 1,
    ...overrides,
  };
}

function createLiveSessionRecord(
  overrides: Partial<LiveSessionRecord> = {},
): LiveSessionRecord {
  return {
    id: LIVE_SESSION_ID,
    chatId: CHAT_ID,
    startedAt: '2026-03-12T00:00:00.000Z',
    endedAt: null,
    status: 'active',
    endedReason: null,
    resumptionHandle: null,
    lastResumptionUpdateAt: null,
    restorable: false,
    invalidatedAt: null,
    invalidationReason: null,
    ...overrides,
  };
}

function createChatSummaryRecord(
  overrides: Partial<DurableChatSummaryRecord> = {},
): DurableChatSummaryRecord {
  return {
    chatId: CHAT_ID,
    schemaVersion: 1,
    source: 'local-recent-history-v1',
    summaryText: 'Compact continuity summary',
    coveredThroughSequence: 3,
    updatedAt: '2026-03-12T00:05:00.000Z',
    ...overrides,
  };
}

function createProjectKnowledgeSearchResult(
  overrides: Partial<ProjectKnowledgeSearchResult> = {},
): ProjectKnowledgeSearchResult {
  return {
    summaryAnswer: 'Use pnpm verify:desktop for the desktop package.',
    supportingExcerpts: [
      {
        sourceId: 'doc-1',
        text: 'Desktop package verification uses pnpm verify:desktop.',
      },
    ],
    sources: [
      {
        id: 'doc-1',
        title: 'README.md',
        path: 'README.md',
      },
    ],
    confidence: 'high',
    retrievalStatus: 'grounded',
    ...overrides,
  };
}

describe('backendClient', () => {
  const getBackendUrl = vi.fn(async () => 'http://localhost:3000');
  const fetchImpl = vi.fn();
  const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const originalBackendUrl = process.env['BACKEND_URL'];

  beforeEach(() => {
    getBackendUrl.mockClear();
    fetchImpl.mockReset();
    consoleInfoSpy.mockClear();
    consoleErrorSpy.mockClear();
    if (typeof originalBackendUrl === 'undefined') {
      delete process.env['BACKEND_URL'];
    } else {
      process.env['BACKEND_URL'] = originalBackendUrl;
    }
  });

  it('checks backend health through the configured backend URL', async () => {
    const response: HealthResponse = { status: 'ok', timestamp: 'now' };
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(async () => response),
    });

    const client = createBackendClient({ fetchImpl, getBackendUrl });

    await expect(client.checkHealth()).resolves.toEqual(response);
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:3000/health');
  });

  it('reads the backend URL from env when no resolver is provided', async () => {
    process.env['BACKEND_URL'] = ' https://api.livepair.dev/v1/ ';
    const response: HealthResponse = { status: 'ok', timestamp: 'now' };
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(async () => response),
    });

    const client = createBackendClient({ fetchImpl });

    await expect(client.checkHealth()).resolves.toEqual(response);
    expect(fetchImpl).toHaveBeenCalledWith('https://api.livepair.dev/v1/health');
  });

  it('throws when the health endpoint returns a non-ok response', async () => {
    fetchImpl.mockResolvedValue({ ok: false, status: 503 });

    const client = createBackendClient({ fetchImpl, getBackendUrl });

    await expect(client.checkHealth()).rejects.toThrow('Health check failed: 503');
  });

  it('rejects malformed health responses from successful requests', async () => {
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(async () => ({ status: 'ok' })),
    });

    const client = createBackendClient({ fetchImpl, getBackendUrl });

    await expect(client.checkHealth()).rejects.toThrow('Health response was invalid');
  });

  it('requests a session token through the configured backend URL', async () => {
    const req: CreateEphemeralTokenRequest = { sessionId: 'session-1' };
    const response: CreateEphemeralTokenResponse = {
      token: 'ephemeral-token',
      expireTime: '2099-03-09T12:30:00.000Z',
      newSessionExpireTime: '2099-03-09T12:01:30.000Z',
    };
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(async () => response),
    });

    const client = createBackendClient({ fetchImpl, getBackendUrl });

    await expect(client.requestSessionToken(req)).resolves.toEqual(response);
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:3000/session/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [SESSION_TOKEN_AUTH_HEADER_NAME]: 'livepair-local-session-token-secret',
      },
      body: JSON.stringify(req),
    });
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      '[desktop:backend-client] session token request started',
      {
        url: 'http://localhost:3000/session/token',
        request: req,
      },
    );
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      '[desktop:backend-client] session token request succeeded',
      {
        url: 'http://localhost:3000/session/token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
        tokenLength: 'ephemeral-token'.length,
      },
    );
  });

  it('sends the configured token credential header when requesting a session token', async () => {
    const response: CreateEphemeralTokenResponse = {
      token: 'ephemeral-token',
      expireTime: '2099-03-09T12:30:00.000Z',
      newSessionExpireTime: '2099-03-09T12:01:30.000Z',
    };
    const originalSecret = process.env['SESSION_TOKEN_AUTH_SECRET'];
    process.env['SESSION_TOKEN_AUTH_SECRET'] = 'desktop-secret';
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(async () => response),
    });

    try {
      const client = createBackendClient({ fetchImpl, getBackendUrl });

      await expect(client.requestSessionToken({})).resolves.toEqual(response);
      expect(fetchImpl).toHaveBeenCalledWith('http://localhost:3000/session/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [SESSION_TOKEN_AUTH_HEADER_NAME]: 'desktop-secret',
        },
        body: JSON.stringify({}),
      });
    } finally {
      if (typeof originalSecret === 'undefined') {
        delete process.env['SESSION_TOKEN_AUTH_SECRET'];
      } else {
        process.env['SESSION_TOKEN_AUTH_SECRET'] = originalSecret;
      }
    }
  });

  it('uses the local default token credential header when no env override is set', async () => {
    const response: CreateEphemeralTokenResponse = {
      token: 'ephemeral-token',
      expireTime: '2099-03-09T12:30:00.000Z',
      newSessionExpireTime: '2099-03-09T12:01:30.000Z',
    };
    const originalSecret = process.env['SESSION_TOKEN_AUTH_SECRET'];
    delete process.env['SESSION_TOKEN_AUTH_SECRET'];
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(async () => response),
    });

    try {
      const client = createBackendClient({ fetchImpl, getBackendUrl });

      await expect(client.requestSessionToken({})).resolves.toEqual(response);
      expect(fetchImpl).toHaveBeenCalledWith('http://localhost:3000/session/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [SESSION_TOKEN_AUTH_HEADER_NAME]: 'livepair-local-session-token-secret',
        },
        body: JSON.stringify({}),
      });
    } finally {
      if (typeof originalSecret === 'undefined') {
        delete process.env['SESSION_TOKEN_AUTH_SECRET'];
      } else {
        process.env['SESSION_TOKEN_AUTH_SECRET'] = originalSecret;
      }
    }
  });

  it('rejects malformed token responses before bootstrap uses them', async () => {
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(async () => ({
        token: '',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      })),
    });

    const client = createBackendClient({ fetchImpl, getBackendUrl });

    await expect(client.requestSessionToken({})).rejects.toThrow(
      'Token response was invalid',
    );
  });

  it('rejects expired token responses before live connect starts', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-09T12:00:00.000Z'));
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(async () => ({
        token: 'ephemeral-token',
        expireTime: '2026-03-09T12:30:00.000Z',
        newSessionExpireTime: '2026-03-09T11:59:59.000Z',
      })),
    });

    const client = createBackendClient({ fetchImpl, getBackendUrl });

    await expect(client.requestSessionToken({})).rejects.toThrow(
      'Token response was expired before Live connect',
    );

    vi.useRealTimers();
  });

  it('posts live telemetry batches through the protected backend observability route', async () => {
    const telemetryEvents: LiveTelemetryEvent[] = [
      {
        eventType: 'live_session_started',
        occurredAt: '2026-03-16T14:00:00.000Z',
        sessionId: LIVE_SESSION_ID,
        chatId: CHAT_ID,
        environment: 'test',
        platform: 'linux',
        appVersion: '0.0.1',
        model: 'models/gemini',
      },
    ];
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 202,
      text: vi.fn(async () => ''),
    });
    const client = createBackendClient({ fetchImpl, getBackendUrl });

    await expect(client.reportLiveTelemetry(telemetryEvents)).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:3000/observability/live-telemetry', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [SESSION_TOKEN_AUTH_HEADER_NAME]: 'livepair-local-session-token-secret',
      },
      body: JSON.stringify({ events: telemetryEvents }),
    });
  });

  it('throws when the token endpoint returns a non-ok response', async () => {
    fetchImpl.mockResolvedValue({
      ok: false,
      status: 401,
      text: vi.fn(async () => '{"message":"Gemini token request failed: upstream 400 INVALID_ARGUMENT"}'),
    });

    const client = createBackendClient({ fetchImpl, getBackendUrl });

    await expect(client.requestSessionToken({})).rejects.toThrow(
      'Token request failed: 401 - Gemini token request failed: upstream 400 INVALID_ARGUMENT',
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[desktop:backend-client] session token request failed',
      {
        url: 'http://localhost:3000/session/token',
        status: 401,
        detail: 'Gemini token request failed: upstream 400 INVALID_ARGUMENT',
      },
    );
  });

  it('routes project knowledge retrieval through the backend endpoint', async () => {
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(async () => createProjectKnowledgeSearchResult()),
    });

    const client = createBackendClient({ fetchImpl, getBackendUrl });

    await expect(
      client.searchProjectKnowledge({ query: 'How do I verify the desktop package?' }),
    ).resolves.toEqual(createProjectKnowledgeSearchResult());
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:3000/project-knowledge/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'How do I verify the desktop package?' }),
    });
  });

  it('rejects malformed project knowledge responses from successful requests', async () => {
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(async () => ({
        summaryAnswer: '',
        supportingExcerpts: [],
        sources: [],
        confidence: 'high',
        retrievalStatus: 'grounded',
      })),
    });

    const client = createBackendClient({ fetchImpl, getBackendUrl });

    await expect(
      client.searchProjectKnowledge({ query: 'How do I verify the desktop package?' }),
    ).rejects.toThrow('Project knowledge response was invalid');
  });

  it('routes chat-memory operations through backend endpoints', async () => {
    const createChatRequest: CreateChatRequest = { title: 'Fresh chat' };
    const appendRequest: AppendChatMessageRequest = {
      chatId: CHAT_ID,
      role: 'assistant',
      contentText: 'Stored',
      answerMetadata: {
        provenance: 'unverified',
        thinkingText: 'Hidden assistant draft',
      },
    };
    const createLiveSessionRequest: CreateLiveSessionRequest = {
      chatId: CHAT_ID,
      startedAt: '2026-03-12T09:00:00.000Z',
    };
    const updateResumptionRequest: UpdateLiveSessionRequest = {
      kind: 'resumption',
      id: LIVE_SESSION_ID,
      resumptionHandle: 'handles/live-session-1',
      lastResumptionUpdateAt: '2026-03-12T09:01:00.000Z',
      restorable: true,
      invalidatedAt: null,
      invalidationReason: null,
    };
    const updateSnapshotRequest: UpdateLiveSessionRequest = {
      kind: 'snapshot',
      id: LIVE_SESSION_ID,
      summarySnapshot: 'Persisted summary snapshot',
      contextStateSnapshot: {
        task: {
          entries: [{ key: 'taskStatus', value: 'active' }],
        },
        context: {
          entries: [{ key: 'repo', value: 'Livepair' }],
        },
      },
    };
    const endLiveSessionRequest: EndLiveSessionRequest = {
      id: LIVE_SESSION_ID,
      status: 'ended',
      endedAt: '2026-03-12T09:05:00.000Z',
      endedReason: 'user-ended',
    };
    fetchImpl
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: vi.fn(async () => createChatRecord({ title: 'Fresh chat' })),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn(async () => createChatRecord()),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn(async () => createChatRecord()),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn(async () => [createChatRecord()]),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn(async () => [
          createChatMessageRecord({
            answerMetadata: {
              provenance: 'tool_grounded',
              confidence: 'high',
              thinkingText: 'Stored reasoning trace',
            },
          }),
        ]),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn(async () => JSON.stringify(createChatSummaryRecord())),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: vi.fn(async () =>
          createChatMessageRecord({
            role: 'assistant',
            contentText: 'Stored',
            answerMetadata: {
              provenance: 'unverified',
              thinkingText: 'Hidden assistant draft',
            },
          }),
        ),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: vi.fn(async () => createLiveSessionRecord()),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn(async () => [createLiveSessionRecord()]),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn(async () =>
          createLiveSessionRecord({
            resumptionHandle: 'handles/live-session-1',
            lastResumptionUpdateAt: '2026-03-12T09:01:00.000Z',
            restorable: true,
          }),
        ),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn(async () =>
          createLiveSessionRecord({
            summarySnapshot: 'Persisted summary snapshot',
            contextStateSnapshot: {
              task: {
                entries: [{ key: 'taskStatus', value: 'active' }],
              },
              context: {
                entries: [{ key: 'repo', value: 'Livepair' }],
              },
            },
          }),
        ),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn(async () =>
          createLiveSessionRecord({
            endedAt: '2026-03-12T09:05:00.000Z',
            status: 'ended',
            endedReason: 'user-ended',
          }),
        ),
      });

    const client = createBackendClient({ fetchImpl, getBackendUrl });

    await expect(client.createChat(createChatRequest)).resolves.toEqual(
      createChatRecord({ title: 'Fresh chat' }),
    );
    await expect(client.getChat(CHAT_ID)).resolves.toEqual(createChatRecord());
    await expect(client.getOrCreateCurrentChat()).resolves.toEqual(createChatRecord());
    await expect(client.listChats()).resolves.toEqual([createChatRecord()]);
    await expect(client.listChatMessages(CHAT_ID)).resolves.toEqual([
      createChatMessageRecord({
        answerMetadata: {
          provenance: 'tool_grounded',
          confidence: 'high',
          thinkingText: 'Stored reasoning trace',
        },
      }),
    ]);
    await expect(client.getChatSummary(CHAT_ID)).resolves.toEqual(
      createChatSummaryRecord(),
    );
    await expect(client.appendChatMessage(appendRequest)).resolves.toEqual(
      createChatMessageRecord({
        role: 'assistant',
        contentText: 'Stored',
        answerMetadata: {
          provenance: 'unverified',
          thinkingText: 'Hidden assistant draft',
        },
      }),
    );
    await expect(client.createLiveSession(createLiveSessionRequest)).resolves.toEqual(
      createLiveSessionRecord(),
    );
    await expect(client.listLiveSessions(CHAT_ID)).resolves.toEqual([
      createLiveSessionRecord(),
    ]);
    await expect(client.updateLiveSession(updateResumptionRequest)).resolves.toEqual(
      createLiveSessionRecord({
        resumptionHandle: 'handles/live-session-1',
        lastResumptionUpdateAt: '2026-03-12T09:01:00.000Z',
        restorable: true,
      }),
    );
    await expect(client.updateLiveSession(updateSnapshotRequest)).resolves.toEqual(
      createLiveSessionRecord({
        summarySnapshot: 'Persisted summary snapshot',
        contextStateSnapshot: {
          task: {
            entries: [{ key: 'taskStatus', value: 'active' }],
          },
          context: {
            entries: [{ key: 'repo', value: 'Livepair' }],
          },
        },
      }),
    );
    await expect(client.endLiveSession(endLiveSessionRequest)).resolves.toEqual(
      createLiveSessionRecord({
        endedAt: '2026-03-12T09:05:00.000Z',
        status: 'ended',
        endedReason: 'user-ended',
      }),
    );

    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'http://localhost:3000/chat-memory/chats', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [SESSION_TOKEN_AUTH_HEADER_NAME]: 'livepair-local-session-token-secret',
      },
      body: JSON.stringify(createChatRequest),
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      `http://localhost:3000/chat-memory/chats/${CHAT_ID}`,
      {
        headers: {
          [SESSION_TOKEN_AUTH_HEADER_NAME]: 'livepair-local-session-token-secret',
        },
      },
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      'http://localhost:3000/chat-memory/chats/current',
      {
        method: 'PUT',
        headers: {
          [SESSION_TOKEN_AUTH_HEADER_NAME]: 'livepair-local-session-token-secret',
        },
      },
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(4, 'http://localhost:3000/chat-memory/chats', {
      headers: {
        [SESSION_TOKEN_AUTH_HEADER_NAME]: 'livepair-local-session-token-secret',
      },
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      5,
      `http://localhost:3000/chat-memory/chats/${CHAT_ID}/messages`,
      {
        headers: {
          [SESSION_TOKEN_AUTH_HEADER_NAME]: 'livepair-local-session-token-secret',
        },
      },
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      6,
      `http://localhost:3000/chat-memory/chats/${CHAT_ID}/summary`,
      {
        headers: {
          [SESSION_TOKEN_AUTH_HEADER_NAME]: 'livepair-local-session-token-secret',
        },
      },
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      7,
      `http://localhost:3000/chat-memory/chats/${CHAT_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [SESSION_TOKEN_AUTH_HEADER_NAME]: 'livepair-local-session-token-secret',
        },
        body: JSON.stringify(appendRequest),
      },
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      8,
      `http://localhost:3000/chat-memory/chats/${CHAT_ID}/live-sessions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [SESSION_TOKEN_AUTH_HEADER_NAME]: 'livepair-local-session-token-secret',
        },
        body: JSON.stringify(createLiveSessionRequest),
      },
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      9,
      `http://localhost:3000/chat-memory/chats/${CHAT_ID}/live-sessions`,
      {
        headers: {
          [SESSION_TOKEN_AUTH_HEADER_NAME]: 'livepair-local-session-token-secret',
        },
      },
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      10,
      `http://localhost:3000/chat-memory/live-sessions/${LIVE_SESSION_ID}/resumption`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          [SESSION_TOKEN_AUTH_HEADER_NAME]: 'livepair-local-session-token-secret',
        },
        body: JSON.stringify(updateResumptionRequest),
      },
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      11,
      `http://localhost:3000/chat-memory/live-sessions/${LIVE_SESSION_ID}/snapshot`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          [SESSION_TOKEN_AUTH_HEADER_NAME]: 'livepair-local-session-token-secret',
        },
        body: JSON.stringify(updateSnapshotRequest),
      },
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      12,
      `http://localhost:3000/chat-memory/live-sessions/${LIVE_SESSION_ID}/end`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [SESSION_TOKEN_AUTH_HEADER_NAME]: 'livepair-local-session-token-secret',
        },
        body: JSON.stringify(endLiveSessionRequest),
      },
    );
  });

  it('sends an empty JSON object when creating a chat without a payload', async () => {
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 201,
      json: vi.fn(async () => createChatRecord()),
    });

    const client = createBackendClient({ fetchImpl, getBackendUrl });

    await expect(client.createChat()).resolves.toEqual(createChatRecord());
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:3000/chat-memory/chats', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [SESSION_TOKEN_AUTH_HEADER_NAME]: 'livepair-local-session-token-secret',
      },
      body: JSON.stringify({}),
    });
  });

  it('appends limit query params for bounded chat-memory list reads', async () => {
    fetchImpl
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn(async () => [createChatMessageRecord()]),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn(async () => [createLiveSessionRecord()]),
      });

    const client = createBackendClient({ fetchImpl, getBackendUrl });

    await expect(client.listChatMessages(CHAT_ID, { limit: 1 })).resolves.toEqual([
      createChatMessageRecord(),
    ]);
    await expect(client.listLiveSessions(CHAT_ID, { limit: 1 })).resolves.toEqual([
      createLiveSessionRecord(),
    ]);

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      `http://localhost:3000/chat-memory/chats/${CHAT_ID}/messages?limit=1`,
      {
        headers: {
          [SESSION_TOKEN_AUTH_HEADER_NAME]: 'livepair-local-session-token-secret',
        },
      },
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      `http://localhost:3000/chat-memory/chats/${CHAT_ID}/live-sessions?limit=1`,
      {
        headers: {
          [SESSION_TOKEN_AUTH_HEADER_NAME]: 'livepair-local-session-token-secret',
        },
      },
    );
  });

  it('maps missing chat responses to null to preserve the bridge contract', async () => {
    fetchImpl.mockResolvedValue({
      ok: false,
      status: 404,
      text: vi.fn(async () => '{"message":"Chat not found"}'),
    });

    const client = createBackendClient({ fetchImpl, getBackendUrl });

    await expect(client.getChat(MISSING_CHAT_ID)).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledWith(`http://localhost:3000/chat-memory/chats/${MISSING_CHAT_ID}`, {
      headers: {
        [SESSION_TOKEN_AUTH_HEADER_NAME]: 'livepair-local-session-token-secret',
      },
    });
  });

  it('reads the current chat without creating it', async () => {
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(async () => createChatRecord()),
    });

    const client = createBackendClient({ fetchImpl, getBackendUrl });

    await expect(client.getCurrentChat()).resolves.toEqual(createChatRecord());
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:3000/chat-memory/chats/current', {
      headers: {
        [SESSION_TOKEN_AUTH_HEADER_NAME]: 'livepair-local-session-token-secret',
      },
    });
  });

  it('maps missing current chat responses to null to preserve lazy startup', async () => {
    fetchImpl.mockResolvedValue({
      ok: false,
      status: 404,
      text: vi.fn(async () => '{"message":"Current chat not found"}'),
    });

    const client = createBackendClient({ fetchImpl, getBackendUrl });

    await expect(client.getCurrentChat()).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:3000/chat-memory/chats/current', {
      headers: {
        [SESSION_TOKEN_AUTH_HEADER_NAME]: 'livepair-local-session-token-secret',
      },
    });
  });

  it('maps 204 chat summary responses to null for new chats without summaries', async () => {
    const json = vi.fn(async () => {
      throw new Error('getChatSummary should not parse a 204 response body');
    });

    fetchImpl.mockResolvedValue({
      ok: true,
      status: 204,
      json,
    });

    const client = createBackendClient({ fetchImpl, getBackendUrl });

    await expect(client.getChatSummary(CHAT_ID)).resolves.toBeNull();
    expect(json).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledWith(`http://localhost:3000/chat-memory/chats/${CHAT_ID}/summary`, {
      headers: {
        [SESSION_TOKEN_AUTH_HEADER_NAME]: 'livepair-local-session-token-secret',
      },
    });
  });

  it('treats unexpected empty successful chat summary responses as no summary', async () => {
    const text = vi.fn(async () => '');
    const json = vi.fn(async () => {
      throw new SyntaxError('Unexpected end of JSON input');
    });

    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      text,
      json,
    });

    const client = createBackendClient({ fetchImpl, getBackendUrl });

    await expect(client.getChatSummary(CHAT_ID)).resolves.toBeNull();
    expect(text).toHaveBeenCalledTimes(1);
  });

  it('throws detailed errors for chat-memory failures', async () => {
    fetchImpl.mockResolvedValue({
      ok: false,
      status: 400,
      text: vi.fn(async () => '{"message":"Path parameter chatId must match body id field"}'),
    });

    const client = createBackendClient({ fetchImpl, getBackendUrl });

    await expect(
      client.appendChatMessage({
        chatId: CHAT_ID,
        role: 'user',
        contentText: 'Hello',
      }),
    ).rejects.toThrow(
      'Append chat message failed: 400 - Path parameter chatId must match body id field',
    );
  });

  it('rejects malformed chat-memory responses from successful requests', async () => {
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(async () => [{ id: CHAT_ID }]),
    });

    const client = createBackendClient({ fetchImpl, getBackendUrl });

    await expect(client.listChats()).rejects.toThrow('Chat list response was invalid');
  });
});
