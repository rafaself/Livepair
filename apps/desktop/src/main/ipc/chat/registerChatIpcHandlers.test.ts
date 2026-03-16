// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ChatMessageRecord,
  ChatRecord,
  DurableChatSummaryRecord,
  LiveSessionRecord,
} from '@livepair/shared-types';
import { SESSION_TOKEN_AUTH_HEADER_NAME } from '@livepair/shared-types';
import { IPC_CHANNELS } from '../../../shared';

const CHAT_ID = '11111111-1111-1111-1111-111111111111';
const MISSING_CHAT_ID = '22222222-2222-2222-2222-222222222222';
const MESSAGE_ID = '33333333-3333-3333-3333-333333333333';
const LIVE_SESSION_ID = '44444444-4444-4444-4444-444444444444';
const mockHandle = vi.fn();

vi.mock('electron', () => ({
  ipcMain: { handle: mockHandle },
}));

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
    voice: null,
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

describe('registerChatIpcHandlers', () => {
  beforeEach(() => {
    vi.resetModules();
    mockHandle.mockReset();
  });

  it('registers chat and live session IPC channels', async () => {
    const { registerChatIpcHandlers } = await import('./registerChatIpcHandlers');

    registerChatIpcHandlers({});

    expect(mockHandle).toHaveBeenCalledTimes(12);
    expect(mockHandle).toHaveBeenNthCalledWith(1, IPC_CHANNELS.createChat, expect.any(Function));
    expect(mockHandle).toHaveBeenNthCalledWith(2, IPC_CHANNELS.getChat, expect.any(Function));
    expect(mockHandle).toHaveBeenNthCalledWith(
      3,
      IPC_CHANNELS.getCurrentChat,
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      4,
      IPC_CHANNELS.getOrCreateCurrentChat,
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(5, IPC_CHANNELS.listChats, expect.any(Function));
    expect(mockHandle).toHaveBeenNthCalledWith(
      6,
      IPC_CHANNELS.listChatMessages,
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      7,
      IPC_CHANNELS.getChatSummary,
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      8,
      IPC_CHANNELS.appendChatMessage,
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      9,
      IPC_CHANNELS.createLiveSession,
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      10,
      IPC_CHANNELS.listLiveSessions,
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      11,
      IPC_CHANNELS.updateLiveSession,
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      12,
      IPC_CHANNELS.endLiveSession,
      expect.any(Function),
    );
  });

  it('validates chat memory requests before calling the backend client', async () => {
    const fetchImpl = vi.fn();
    const { registerChatIpcHandlers } = await import('./registerChatIpcHandlers');

    registerChatIpcHandlers({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const createChatHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.createChat,
    )?.[1] as (_event: unknown, req: unknown) => Promise<ChatRecord>;
    const getChatHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.getChat,
    )?.[1] as (_event: unknown, chatId: unknown) => Promise<ChatRecord | null>;
    const listMessagesHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.listChatMessages,
    )?.[1] as (_event: unknown, chatId: unknown, options?: unknown) => Promise<ChatMessageRecord[]>;
    const getChatSummaryHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.getChatSummary,
    )?.[1] as (_event: unknown, chatId: unknown) => Promise<DurableChatSummaryRecord | null>;
    const appendMessageHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.appendChatMessage,
    )?.[1] as (_event: unknown, req: unknown) => Promise<ChatMessageRecord>;
    const createLiveSessionHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.createLiveSession,
    )?.[1] as (_event: unknown, req: unknown) => Promise<LiveSessionRecord>;
    const listLiveSessionsHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.listLiveSessions,
    )?.[1] as (_event: unknown, chatId: unknown, options?: unknown) => Promise<LiveSessionRecord[]>;
    const updateLiveSessionHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.updateLiveSession,
    )?.[1] as (_event: unknown, req: unknown) => Promise<LiveSessionRecord>;
    const endLiveSessionHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.endLiveSession,
    )?.[1] as (_event: unknown, req: unknown) => Promise<LiveSessionRecord>;

    await expect(createChatHandler({}, { title: 5 })).rejects.toThrow(
      'Invalid create chat payload',
    );
    await expect(getChatHandler({}, '')).rejects.toThrow('Invalid chat id');
    await expect(listMessagesHandler({}, '')).rejects.toThrow('Invalid chat id');
    await expect(listMessagesHandler({}, CHAT_ID, { limit: 0 })).rejects.toThrow(
      'Invalid chat list options',
    );
    await expect(getChatSummaryHandler({}, '')).rejects.toThrow('Invalid chat id');
    await expect(
      appendMessageHandler({}, { chatId: CHAT_ID, role: 'system', contentText: 'bad' }),
    ).rejects.toThrow('Invalid append chat message payload');
    await expect(createLiveSessionHandler({}, { chatId: '' })).rejects.toThrow(
      'Invalid create live session payload',
    );
    await expect(createLiveSessionHandler({}, { chatId: CHAT_ID })).rejects.toThrow(
      'Invalid create live session payload',
    );
    await expect(listLiveSessionsHandler({}, '')).rejects.toThrow('Invalid chat id');
    await expect(listLiveSessionsHandler({}, CHAT_ID, { limit: 0 })).rejects.toThrow(
      'Invalid chat list options',
    );
    await expect(
      updateLiveSessionHandler({}, { kind: 'resumption', id: '', restorable: true }),
    ).rejects.toThrow('Invalid update live session payload');
    await expect(endLiveSessionHandler({}, { id: '', status: 'ended' })).rejects.toThrow(
      'Invalid end live session payload',
    );

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('forwards bounded chat-memory list options through IPC', async () => {
    const fetchImpl = vi.fn()
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
    const { registerChatIpcHandlers } = await import('./registerChatIpcHandlers');

    registerChatIpcHandlers({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const listMessagesHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.listChatMessages,
    )?.[1] as (
      _event: unknown,
      chatId: unknown,
      options: unknown,
    ) => Promise<ChatMessageRecord[]>;
    const listLiveSessionsHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.listLiveSessions,
    )?.[1] as (
      _event: unknown,
      chatId: unknown,
      options: unknown,
    ) => Promise<LiveSessionRecord[]>;

    await expect(listMessagesHandler({}, CHAT_ID, { limit: 1 })).resolves.toEqual([
      createChatMessageRecord(),
    ]);
    await expect(listLiveSessionsHandler({}, CHAT_ID, { limit: 1 })).resolves.toEqual([
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

  it('delegates chat memory requests through the backend client', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: vi.fn(async () => createChatRecord({ title: 'New chat' })),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: vi.fn(async () => '{"message":"Chat not found"}'),
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
            lastResumptionUpdateAt: '2026-03-12T00:01:00.000Z',
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
            endedAt: '2026-03-12T00:05:00.000Z',
            status: 'ended',
            endedReason: 'user-ended',
          }),
        ),
      });
    const { registerChatIpcHandlers } = await import('./registerChatIpcHandlers');

    registerChatIpcHandlers({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const createChatHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.createChat,
    )?.[1] as (_event: unknown, req: unknown) => Promise<ChatRecord>;
    const getChatHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.getChat,
    )?.[1] as (_event: unknown, chatId: unknown) => Promise<ChatRecord | null>;
    const getCurrentChatHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.getCurrentChat,
    )?.[1] as () => Promise<ChatRecord | null>;
    const getOrCreateCurrentChatHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.getOrCreateCurrentChat,
    )?.[1] as () => Promise<ChatRecord>;
    const listChatsHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.listChats,
    )?.[1] as () => Promise<ChatRecord[]>;
    const listMessagesHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.listChatMessages,
    )?.[1] as (_event: unknown, chatId: unknown) => Promise<ChatMessageRecord[]>;
    const getChatSummaryHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.getChatSummary,
    )?.[1] as (_event: unknown, chatId: unknown) => Promise<DurableChatSummaryRecord | null>;
    const appendMessageHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.appendChatMessage,
    )?.[1] as (_event: unknown, req: unknown) => Promise<ChatMessageRecord>;
    const createLiveSessionHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.createLiveSession,
    )?.[1] as (_event: unknown, req: unknown) => Promise<LiveSessionRecord>;
    const listLiveSessionsHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.listLiveSessions,
    )?.[1] as (_event: unknown, chatId: unknown) => Promise<LiveSessionRecord[]>;
    const updateLiveSessionHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.updateLiveSession,
    )?.[1] as (_event: unknown, req: unknown) => Promise<LiveSessionRecord>;
    const endLiveSessionHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.endLiveSession,
    )?.[1] as (_event: unknown, req: unknown) => Promise<LiveSessionRecord>;

    await expect(createChatHandler({}, { title: 'New chat' })).resolves.toEqual(
      createChatRecord({ title: 'New chat' }),
    );
    await expect(getChatHandler({}, MISSING_CHAT_ID)).resolves.toBeNull();
    await expect(getCurrentChatHandler()).resolves.toEqual(createChatRecord());
    await expect(getOrCreateCurrentChatHandler()).resolves.toEqual(createChatRecord());
    await expect(listChatsHandler()).resolves.toEqual([createChatRecord()]);
    await expect(listMessagesHandler({}, CHAT_ID)).resolves.toEqual([
      createChatMessageRecord(),
    ]);
    await expect(getChatSummaryHandler({}, CHAT_ID)).resolves.toEqual(
      createChatSummaryRecord(),
    );
    await expect(
      appendMessageHandler({}, {
        chatId: CHAT_ID,
        role: 'assistant',
        contentText: 'Stored',
      }),
    ).resolves.toEqual(
      createChatMessageRecord({
        role: 'assistant',
        contentText: 'Stored',
      }),
    );
    await expect(createLiveSessionHandler({}, { chatId: CHAT_ID, voice: 'Puck' })).resolves.toEqual(
      createLiveSessionRecord(),
    );
    await expect(listLiveSessionsHandler({}, CHAT_ID)).resolves.toEqual([
      createLiveSessionRecord(),
    ]);
    await expect(
      updateLiveSessionHandler({}, {
        kind: 'resumption',
        id: LIVE_SESSION_ID,
        resumptionHandle: 'handles/live-session-1',
        lastResumptionUpdateAt: '2026-03-12T00:01:00.000Z',
        restorable: true,
        invalidatedAt: null,
        invalidationReason: null,
      }),
    ).resolves.toEqual(
      createLiveSessionRecord({
        resumptionHandle: 'handles/live-session-1',
        lastResumptionUpdateAt: '2026-03-12T00:01:00.000Z',
        restorable: true,
      }),
    );
    await expect(
      updateLiveSessionHandler({}, {
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
      }),
    ).resolves.toEqual(
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
    await expect(
      endLiveSessionHandler({}, {
        id: LIVE_SESSION_ID,
        status: 'ended',
        endedAt: '2026-03-12T00:05:00.000Z',
        endedReason: 'user-ended',
      }),
    ).resolves.toEqual(
      createLiveSessionRecord({
        endedAt: '2026-03-12T00:05:00.000Z',
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
      body: JSON.stringify({ title: 'New chat' }),
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      `http://localhost:3000/chat-memory/chats/${MISSING_CHAT_ID}`,
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
        headers: {
          [SESSION_TOKEN_AUTH_HEADER_NAME]: 'livepair-local-session-token-secret',
        },
      },
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      4,
      'http://localhost:3000/chat-memory/chats/current',
      {
        method: 'PUT',
        headers: {
          [SESSION_TOKEN_AUTH_HEADER_NAME]: 'livepair-local-session-token-secret',
        },
      },
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(5, 'http://localhost:3000/chat-memory/chats', {
      headers: {
        [SESSION_TOKEN_AUTH_HEADER_NAME]: 'livepair-local-session-token-secret',
      },
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      6,
      `http://localhost:3000/chat-memory/chats/${CHAT_ID}/messages`,
      {
        headers: {
          [SESSION_TOKEN_AUTH_HEADER_NAME]: 'livepair-local-session-token-secret',
        },
      },
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      7,
      `http://localhost:3000/chat-memory/chats/${CHAT_ID}/summary`,
      {
        headers: {
          [SESSION_TOKEN_AUTH_HEADER_NAME]: 'livepair-local-session-token-secret',
        },
      },
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      8,
      `http://localhost:3000/chat-memory/chats/${CHAT_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [SESSION_TOKEN_AUTH_HEADER_NAME]: 'livepair-local-session-token-secret',
        },
        body: JSON.stringify({
          chatId: CHAT_ID,
          role: 'assistant',
          contentText: 'Stored',
        }),
      },
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      9,
      `http://localhost:3000/chat-memory/chats/${CHAT_ID}/live-sessions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [SESSION_TOKEN_AUTH_HEADER_NAME]: 'livepair-local-session-token-secret',
        },
        body: JSON.stringify({ chatId: CHAT_ID, voice: 'Puck' }),
      },
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      10,
      `http://localhost:3000/chat-memory/chats/${CHAT_ID}/live-sessions`,
      {
        headers: {
          [SESSION_TOKEN_AUTH_HEADER_NAME]: 'livepair-local-session-token-secret',
        },
      },
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      11,
      `http://localhost:3000/chat-memory/live-sessions/${LIVE_SESSION_ID}/resumption`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          [SESSION_TOKEN_AUTH_HEADER_NAME]: 'livepair-local-session-token-secret',
        },
        body: JSON.stringify({
          kind: 'resumption',
          id: LIVE_SESSION_ID,
          resumptionHandle: 'handles/live-session-1',
          lastResumptionUpdateAt: '2026-03-12T00:01:00.000Z',
          restorable: true,
          invalidatedAt: null,
          invalidationReason: null,
        }),
      },
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      12,
      `http://localhost:3000/chat-memory/live-sessions/${LIVE_SESSION_ID}/snapshot`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          [SESSION_TOKEN_AUTH_HEADER_NAME]: 'livepair-local-session-token-secret',
        },
        body: JSON.stringify({
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
        }),
      },
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      13,
      `http://localhost:3000/chat-memory/live-sessions/${LIVE_SESSION_ID}/end`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [SESSION_TOKEN_AUTH_HEADER_NAME]: 'livepair-local-session-token-secret',
        },
        body: JSON.stringify({
          id: LIVE_SESSION_ID,
          status: 'ended',
          endedAt: '2026-03-12T00:05:00.000Z',
          endedReason: 'user-ended',
        }),
      },
    );
  });

  it('returns null from getChatSummary when the backend responds with 204', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 204,
    });
    const { registerChatIpcHandlers } = await import('./registerChatIpcHandlers');

    registerChatIpcHandlers({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const getChatSummaryHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.getChatSummary,
    )?.[1] as (_event: unknown, chatId: unknown) => Promise<DurableChatSummaryRecord | null>;

    await expect(getChatSummaryHandler({}, CHAT_ID)).resolves.toBeNull();
  });
});
