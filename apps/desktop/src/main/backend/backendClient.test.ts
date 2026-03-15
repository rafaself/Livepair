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
  LiveSessionRecord,
  UpdateLiveSessionRequest,
} from '@livepair/shared-types';
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

describe('backendClient', () => {
  const getBackendUrl = vi.fn(async () => 'http://localhost:3000');
  const fetchImpl = vi.fn();
  const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  beforeEach(() => {
    getBackendUrl.mockClear();
    fetchImpl.mockReset();
    consoleInfoSpy.mockClear();
    consoleErrorSpy.mockClear();
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
      headers: { 'Content-Type': 'application/json' },
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

  it('routes chat-memory operations through backend endpoints', async () => {
    const createChatRequest: CreateChatRequest = { title: 'Fresh chat' };
    const appendRequest: AppendChatMessageRequest = {
      chatId: CHAT_ID,
      role: 'assistant',
      contentText: 'Stored',
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
        json: vi.fn(async () => [createChatMessageRecord()]),
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
      createChatMessageRecord(),
    ]);
    await expect(client.getChatSummary(CHAT_ID)).resolves.toEqual(
      createChatSummaryRecord(),
    );
    await expect(client.appendChatMessage(appendRequest)).resolves.toEqual(
      createChatMessageRecord({
        role: 'assistant',
        contentText: 'Stored',
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createChatRequest),
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      `http://localhost:3000/chat-memory/chats/${CHAT_ID}`,
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      'http://localhost:3000/chat-memory/chats/current',
      { method: 'PUT' },
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(4, 'http://localhost:3000/chat-memory/chats');
    expect(fetchImpl).toHaveBeenNthCalledWith(
      5,
      `http://localhost:3000/chat-memory/chats/${CHAT_ID}/messages`,
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      6,
      `http://localhost:3000/chat-memory/chats/${CHAT_ID}/summary`,
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      7,
      `http://localhost:3000/chat-memory/chats/${CHAT_ID}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appendRequest),
      },
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      8,
      `http://localhost:3000/chat-memory/chats/${CHAT_ID}/live-sessions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createLiveSessionRequest),
      },
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      9,
      `http://localhost:3000/chat-memory/chats/${CHAT_ID}/live-sessions`,
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      10,
      `http://localhost:3000/chat-memory/live-sessions/${LIVE_SESSION_ID}/resumption`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateResumptionRequest),
      },
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      11,
      `http://localhost:3000/chat-memory/live-sessions/${LIVE_SESSION_ID}/snapshot`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateSnapshotRequest),
      },
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      12,
      `http://localhost:3000/chat-memory/live-sessions/${LIVE_SESSION_ID}/end`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  });

  it('maps missing chat responses to null to preserve the bridge contract', async () => {
    fetchImpl.mockResolvedValue({
      ok: false,
      status: 404,
      text: vi.fn(async () => '{"message":"Chat not found"}'),
    });

    const client = createBackendClient({ fetchImpl, getBackendUrl });

    await expect(client.getChat(MISSING_CHAT_ID)).resolves.toBeNull();
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
