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
        listMessages: vi.fn(),
        appendMessage: vi.fn(),
        createLiveSession: vi.fn(),
        listLiveSessions: vi.fn(),
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
      listMessages: vi.fn(() => [{ id: 'message-1' }]),
      appendMessage: vi.fn(() => ({ id: 'message-1' })),
      createLiveSession: vi.fn(() => ({ id: 'live-session-1' })),
      listLiveSessions: vi.fn(() => [{ id: 'live-session-1' }]),
      updateLiveSession: vi.fn(() => ({ id: 'live-session-1', resumable: true })),
      endLiveSession: vi.fn(() => ({ id: 'live-session-1', status: 'ended' })),
    };
    const service = new ChatMemoryService(repository as never);

    expect(service.createChat({ title: 'New chat' })).toEqual({ id: 'chat-1' });
    expect(service.getChat('chat-1')).toEqual({ id: 'chat-1' });
    expect(service.getOrCreateCurrentChat()).toEqual({ id: 'chat-1' });
    expect(service.listMessages('chat-1')).toEqual([{ id: 'message-1' }]);
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
        id: 'live-session-1',
        latestResumeHandle: 'handles/live-session-1',
        resumable: true,
      }),
    ).toEqual({
      id: 'live-session-1',
      resumable: true,
    });
    expect(
      service.endLiveSession({
        id: 'live-session-1',
        status: 'ended',
      }),
    ).toEqual({
      id: 'live-session-1',
      status: 'ended',
    });

    expect(repository.createChat).toHaveBeenCalledWith({ title: 'New chat' });
    expect(repository.getChat).toHaveBeenCalledWith('chat-1');
    expect(repository.getOrCreateCurrentChat).toHaveBeenCalledTimes(1);
    expect(repository.listMessages).toHaveBeenCalledWith('chat-1');
    expect(repository.appendMessage).toHaveBeenCalledWith({
      chatId: 'chat-1',
      role: 'user',
      contentText: 'Hello',
    });
    expect(repository.createLiveSession).toHaveBeenCalledWith({ chatId: 'chat-1' });
    expect(repository.listLiveSessions).toHaveBeenCalledWith('chat-1');
    expect(repository.updateLiveSession).toHaveBeenCalledWith({
      id: 'live-session-1',
      latestResumeHandle: 'handles/live-session-1',
      resumable: true,
    });
    expect(repository.endLiveSession).toHaveBeenCalledWith({
      id: 'live-session-1',
      status: 'ended',
    });
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
