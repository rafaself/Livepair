// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetPath = vi.fn(() => '/tmp/livepair-user-data');
const repositoryConstructor = vi.fn();

vi.mock('electron', () => ({
  app: {
    getPath: mockGetPath,
  },
}));

vi.mock('./chatMemoryDatabase', () => ({
  createChatMemoryDatabase: vi.fn((databaseFilePath: string) => {
    repositoryConstructor(databaseFilePath);
    return { close: vi.fn() };
  }),
}));

    vi.mock('./chatMemoryRepository', () => ({
      SqliteChatMemoryRepository: vi.fn().mockImplementation(() => ({
        createChat: vi.fn(),
        getChat: vi.fn(),
        getOrCreateCurrentChat: vi.fn(),
        listChats: vi.fn(),
        listMessages: vi.fn(),
        getChatSummary: vi.fn(),
        appendMessage: vi.fn(),
        createLiveSession: vi.fn(),
        listLiveSessions: vi.fn(),
        upsertChatSummary: vi.fn(),
        updateLiveSession: vi.fn(),
        endLiveSession: vi.fn(),
      })),
    }));

describe('ChatMemoryService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('delegates operations to the repository', async () => {
    const { ChatMemoryService } = await import('./chatMemoryService');
    const repository = {
      createChat: vi.fn(() => ({ id: 'chat-1' })),
      getChat: vi.fn(() => ({ id: 'chat-1' })),
      getOrCreateCurrentChat: vi.fn(() => ({ id: 'chat-1' })),
      listChats: vi.fn(() => [{ id: 'chat-1' }, { id: 'chat-2' }]),
      listMessages: vi.fn(() => [
        {
          id: 'message-1',
          chatId: 'chat-1',
          role: 'user',
          contentText: 'Hello',
          createdAt: '2026-03-12T09:00:00.000Z',
          sequence: 1,
        },
      ]),
      getChatSummary: vi.fn(() => null),
      appendMessage: vi.fn(() => ({ id: 'message-1' })),
      createLiveSession: vi.fn(() => ({ id: 'live-session-1' })),
      listLiveSessions: vi.fn(() => [{ id: 'live-session-1' }]),
      upsertChatSummary: vi.fn(),
      updateLiveSession: vi.fn(() => ({ id: 'live-session-1', restorable: true })),
      endLiveSession: vi.fn(() => ({
        id: 'live-session-1',
        chatId: 'chat-1',
        status: 'ended',
        endedAt: '2026-03-12T09:05:00.000Z',
      })),
    };
    const service = new ChatMemoryService(repository as never);

    expect(service.createChat({ title: 'New chat' })).toEqual({ id: 'chat-1' });
    expect(service.getChat('chat-1')).toEqual({ id: 'chat-1' });
    expect(service.getOrCreateCurrentChat()).toEqual({ id: 'chat-1' });
    expect(service.listChats()).toEqual([{ id: 'chat-1' }, { id: 'chat-2' }]);
    expect(service.listMessages('chat-1')).toEqual([
      {
        id: 'message-1',
        chatId: 'chat-1',
        role: 'user',
        contentText: 'Hello',
        createdAt: '2026-03-12T09:00:00.000Z',
        sequence: 1,
      },
    ]);
    expect(
      service.appendMessage({
        chatId: 'chat-1',
        role: 'user',
        contentText: 'Hello',
      }),
    ).toEqual({ id: 'message-1' });
    expect(service.createLiveSession({ chatId: 'chat-1' })).toEqual({
      id: 'live-session-1',
    });
    expect(service.listLiveSessions('chat-1')).toEqual([{ id: 'live-session-1' }]);
    expect(
      service.updateLiveSession({
        kind: 'resumption',
        id: 'live-session-1',
        resumptionHandle: 'handles/live-session-1',
        lastResumptionUpdateAt: '2026-03-12T09:01:00.000Z',
        restorable: true,
      }),
    ).toEqual({
      id: 'live-session-1',
      restorable: true,
    });
    expect(
      service.endLiveSession({
        id: 'live-session-1',
        status: 'ended',
      }),
    ).toEqual({
      id: 'live-session-1',
      chatId: 'chat-1',
      status: 'ended',
      endedAt: '2026-03-12T09:05:00.000Z',
    });

    expect(repository.createChat).toHaveBeenCalledWith({ title: 'New chat' });
    expect(repository.getChat).toHaveBeenCalledWith('chat-1');
    expect(repository.getOrCreateCurrentChat).toHaveBeenCalledTimes(1);
    expect(repository.listChats).toHaveBeenCalledTimes(1);
    expect(repository.listMessages).toHaveBeenCalledWith('chat-1');
    expect(repository.appendMessage).toHaveBeenCalledWith({
      chatId: 'chat-1',
      role: 'user',
      contentText: 'Hello',
    });
    expect(repository.createLiveSession).toHaveBeenCalledWith({ chatId: 'chat-1' });
    expect(repository.listLiveSessions).toHaveBeenCalledWith('chat-1');
    expect(repository.getChatSummary).toHaveBeenCalledWith('chat-1');
    expect(repository.updateLiveSession).toHaveBeenCalledWith({
      kind: 'resumption',
      id: 'live-session-1',
      resumptionHandle: 'handles/live-session-1',
      lastResumptionUpdateAt: '2026-03-12T09:01:00.000Z',
      restorable: true,
    });
    expect(repository.endLiveSession).toHaveBeenCalledWith({
      id: 'live-session-1',
      status: 'ended',
    });
    expect(repository.upsertChatSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'chat-1',
        coveredThroughSequence: 1,
      }),
    );
  });

  it('does not replace a durable summary when ending a live session without newer history', async () => {
    const { ChatMemoryService } = await import('./chatMemoryService');
    const repository = {
      createChat: vi.fn(),
      getChat: vi.fn(),
      getOrCreateCurrentChat: vi.fn(),
      listChats: vi.fn(),
      listMessages: vi.fn(() => [
        {
          id: 'message-1',
          chatId: 'chat-1',
          role: 'user',
          contentText: 'Persisted request',
          createdAt: '2026-03-12T09:01:00.000Z',
          sequence: 1,
        },
      ]),
      getChatSummary: vi.fn(() => ({
        chatId: 'chat-1',
        schemaVersion: 1,
        source: 'local-recent-history-v1',
        summaryText: 'Existing summary',
        coveredThroughSequence: 1,
        updatedAt: '2026-03-12T09:02:00.000Z',
      })),
      appendMessage: vi.fn(),
      createLiveSession: vi.fn(),
      listLiveSessions: vi.fn(),
      upsertChatSummary: vi.fn(),
      updateLiveSession: vi.fn(),
      endLiveSession: vi.fn(() => ({
        id: 'live-session-1',
        chatId: 'chat-1',
        status: 'ended',
        endedAt: '2026-03-12T09:05:00.000Z',
      })),
    };
    const service = new ChatMemoryService(repository as never);

    expect(
      service.endLiveSession({
        id: 'live-session-1',
        status: 'ended',
      }),
    ).toEqual({
      id: 'live-session-1',
      chatId: 'chat-1',
      status: 'ended',
      endedAt: '2026-03-12T09:05:00.000Z',
    });
    expect(repository.upsertChatSummary).not.toHaveBeenCalled();
  });

  it('creates a singleton repository rooted in the electron userData path', async () => {
    const { getChatMemoryService } = await import('./chatMemoryService');

    const firstInstance = getChatMemoryService();
    const secondInstance = getChatMemoryService();

    expect(firstInstance).toBe(secondInstance);
    expect(mockGetPath).toHaveBeenCalledWith('userData');
    expect(repositoryConstructor).toHaveBeenCalledTimes(1);
    expect(repositoryConstructor).toHaveBeenCalledWith(
      '/tmp/livepair-user-data/chat-memory.sqlite',
    );
  });
});
