// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AppendChatMessageRequest,
  ChatMessageRecord,
  ChatRecord,
  DurableChatSummaryRecord,
  LiveSessionRecord,
} from '@livepair/shared-types';
import { IPC_CHANNELS } from '../../../shared';
import type { ChatMemoryService } from '../../chatMemory/chatMemoryService';

const mockHandle = vi.fn();

vi.mock('electron', () => ({
  ipcMain: { handle: mockHandle },
}));

function createChatRecord(overrides: Partial<ChatRecord> = {}): ChatRecord {
  return {
    id: 'chat-1',
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
    id: 'message-1',
    chatId: 'chat-1',
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
    id: 'live-session-1',
    chatId: 'chat-1',
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
    chatId: 'chat-1',
    schemaVersion: 1,
    source: 'local-recent-history-v1',
    summaryText: 'Compact continuity summary',
    coveredThroughSequence: 3,
    updatedAt: '2026-03-12T00:05:00.000Z',
    ...overrides,
  };
}

function createChatMemoryServiceDouble(): ChatMemoryService {
  return {
    createChat: vi.fn(() => createChatRecord()),
    getChat: vi.fn(() => createChatRecord()),
    getOrCreateCurrentChat: vi.fn(() => createChatRecord()),
    listChats: vi.fn(() => [createChatRecord()]),
    listMessages: vi.fn(() => [createChatMessageRecord()]),
    getChatSummary: vi.fn(() => createChatSummaryRecord()),
    appendMessage: vi.fn((request: AppendChatMessageRequest) =>
      createChatMessageRecord(request),
    ),
    createLiveSession: vi.fn(() => createLiveSessionRecord()),
    listLiveSessions: vi.fn(() => [createLiveSessionRecord()]),
    updateLiveSession: vi.fn(() => createLiveSessionRecord({ restorable: true })),
    endLiveSession: vi.fn(() => createLiveSessionRecord({ status: 'ended' })),
  } as unknown as ChatMemoryService;
}

describe('registerChatIpcHandlers', () => {
  beforeEach(() => {
    vi.resetModules();
    mockHandle.mockReset();
  });

  it('registers chat and live session IPC channels', async () => {
    const { registerChatIpcHandlers } = await import('./registerChatIpcHandlers');

    registerChatIpcHandlers({
      chatMemoryService: createChatMemoryServiceDouble(),
    });

    expect(mockHandle).toHaveBeenCalledTimes(11);
    expect(mockHandle).toHaveBeenNthCalledWith(1, IPC_CHANNELS.createChat, expect.any(Function));
    expect(mockHandle).toHaveBeenNthCalledWith(2, IPC_CHANNELS.getChat, expect.any(Function));
    expect(mockHandle).toHaveBeenNthCalledWith(
      3,
      IPC_CHANNELS.getOrCreateCurrentChat,
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(4, IPC_CHANNELS.listChats, expect.any(Function));
    expect(mockHandle).toHaveBeenNthCalledWith(
      5,
      IPC_CHANNELS.listChatMessages,
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      6,
      IPC_CHANNELS.getChatSummary,
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      7,
      IPC_CHANNELS.appendChatMessage,
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      8,
      IPC_CHANNELS.createLiveSession,
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      9,
      IPC_CHANNELS.listLiveSessions,
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      10,
      IPC_CHANNELS.updateLiveSession,
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      11,
      IPC_CHANNELS.endLiveSession,
      expect.any(Function),
    );
  });

  it('validates and delegates chat memory requests', async () => {
    const chatMemoryService = createChatMemoryServiceDouble();
    const { registerChatIpcHandlers } = await import('./registerChatIpcHandlers');

    registerChatIpcHandlers({
      chatMemoryService,
    });

    const createChatHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.createChat,
    )?.[1] as (_event: unknown, req: unknown) => Promise<ChatRecord>;
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

    await expect(createChatHandler({}, { title: 5 })).rejects.toThrow(
      'Invalid create chat payload',
    );
    await expect(listMessagesHandler({}, '')).rejects.toThrow('Invalid chat id');
    await expect(getChatSummaryHandler({}, '')).rejects.toThrow('Invalid chat id');
    await expect(
      appendMessageHandler({}, { chatId: 'chat-1', role: 'system', contentText: 'bad' }),
    ).rejects.toThrow('Invalid append chat message payload');
    await expect(createLiveSessionHandler({}, { chatId: '' })).rejects.toThrow(
      'Invalid create live session payload',
    );
    await expect(listLiveSessionsHandler({}, '')).rejects.toThrow('Invalid chat id');
    await expect(
      updateLiveSessionHandler({}, { kind: 'resumption', id: '', restorable: true }),
    ).rejects.toThrow('Invalid update live session payload');
    await expect(endLiveSessionHandler({}, { id: '', status: 'ended' })).rejects.toThrow(
      'Invalid end live session payload',
    );

    await expect(createChatHandler({}, { title: 'New chat' })).resolves.toEqual(
      createChatRecord(),
    );
    await expect(listChatsHandler()).resolves.toEqual([createChatRecord()]);
    await expect(listMessagesHandler({}, 'chat-1')).resolves.toEqual([
      createChatMessageRecord(),
    ]);
    await expect(getChatSummaryHandler({}, 'chat-1')).resolves.toEqual(
      createChatSummaryRecord(),
    );
    await expect(
      appendMessageHandler({}, {
        chatId: 'chat-1',
        role: 'assistant',
        contentText: 'Stored',
      }),
    ).resolves.toEqual(
      createChatMessageRecord({
        role: 'assistant',
        contentText: 'Stored',
      }),
    );
    await expect(createLiveSessionHandler({}, { chatId: 'chat-1' })).resolves.toEqual(
      createLiveSessionRecord(),
    );
    await expect(listLiveSessionsHandler({}, 'chat-1')).resolves.toEqual([
      createLiveSessionRecord(),
    ]);
    await expect(
      updateLiveSessionHandler({}, {
        kind: 'resumption',
        id: 'live-session-1',
        resumptionHandle: 'handles/live-session-1',
        lastResumptionUpdateAt: '2026-03-12T00:01:00.000Z',
        restorable: true,
        invalidatedAt: null,
        invalidationReason: null,
      }),
    ).resolves.toEqual(createLiveSessionRecord({ restorable: true }));
    await expect(
      endLiveSessionHandler({}, { id: 'live-session-1', status: 'ended' }),
    ).resolves.toEqual(createLiveSessionRecord({ status: 'ended' }));

    expect(chatMemoryService.createChat).toHaveBeenCalledWith({ title: 'New chat' });
    expect(chatMemoryService.listChats).toHaveBeenCalledTimes(1);
    expect(chatMemoryService.listMessages).toHaveBeenCalledWith('chat-1');
    expect(chatMemoryService.getChatSummary).toHaveBeenCalledWith('chat-1');
    expect(chatMemoryService.appendMessage).toHaveBeenCalledWith({
      chatId: 'chat-1',
      role: 'assistant',
      contentText: 'Stored',
    });
    expect(chatMemoryService.createLiveSession).toHaveBeenCalledWith({ chatId: 'chat-1' });
    expect(chatMemoryService.listLiveSessions).toHaveBeenCalledWith('chat-1');
    expect(chatMemoryService.updateLiveSession).toHaveBeenCalledWith({
      kind: 'resumption',
      id: 'live-session-1',
      resumptionHandle: 'handles/live-session-1',
      lastResumptionUpdateAt: '2026-03-12T00:01:00.000Z',
      restorable: true,
      invalidatedAt: null,
      invalidationReason: null,
    });
    expect(chatMemoryService.endLiveSession).toHaveBeenCalledWith({
      id: 'live-session-1',
      status: 'ended',
    });
  });
});
