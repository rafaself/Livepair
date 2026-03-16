import { ChatMemoryService } from './chat-memory.service';

describe('ChatMemoryService', () => {
  it('forwards bounded list reads without preflight chat lookups', async () => {
    const repository = {
      getChat: jest.fn(),
      listMessages: jest.fn(async () => []),
      getChatSummary: jest.fn(async () => null),
      listLiveSessions: jest.fn(async () => []),
      withTransaction: jest.fn(),
    };

    const service = new ChatMemoryService(repository as never);

    await expect(service.listMessages('chat-1', { limit: 1 })).resolves.toEqual([]);
    await expect(service.getChatSummary('chat-1')).resolves.toBeNull();
    await expect(service.listLiveSessions('chat-1', { limit: 1 })).resolves.toEqual([]);

    expect(repository.getChat).not.toHaveBeenCalled();
    expect(repository.listMessages).toHaveBeenCalledWith('chat-1', { limit: 1 });
    expect(repository.getChatSummary).toHaveBeenCalledWith('chat-1');
    expect(repository.listLiveSessions).toHaveBeenCalledWith('chat-1', { limit: 1 });
  });

  it('upserts a durable summary when ending a live session advances coverage', async () => {
    const transactionalRepository = {
      endLiveSession: jest.fn(async () => ({
        id: 'live-session-1',
        chatId: 'chat-1',
        status: 'ended',
        endedAt: '2026-03-12T09:05:00.000Z',
      })),
      listMessages: jest.fn(async () => [
        {
          id: 'message-1',
          chatId: 'chat-1',
          role: 'user',
          contentText: 'Persisted request',
          createdAt: '2026-03-12T09:01:00.000Z',
          sequence: 1,
        },
      ]),
      getChatSummary: jest.fn(async () => null),
      upsertChatSummary: jest.fn(async (summary) => summary),
    };
    const repository = {
      withTransaction: jest.fn(async (operation) => operation(transactionalRepository)),
    };

    const service = new ChatMemoryService(repository as never);

    await expect(
      service.endLiveSession({
        id: 'live-session-1',
        status: 'ended',
      }),
    ).resolves.toEqual({
      id: 'live-session-1',
      chatId: 'chat-1',
      status: 'ended',
      endedAt: '2026-03-12T09:05:00.000Z',
    });

    expect(repository.withTransaction).toHaveBeenCalledTimes(1);
    expect(transactionalRepository.upsertChatSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'chat-1',
        coveredThroughSequence: 1,
      }),
    );
  });

  it('does not replace a durable summary when ending a live session without newer history', async () => {
    const transactionalRepository = {
      endLiveSession: jest.fn(async () => ({
        id: 'live-session-1',
        chatId: 'chat-1',
        status: 'ended',
        endedAt: '2026-03-12T09:05:00.000Z',
      })),
      listMessages: jest.fn(async () => [
        {
          id: 'message-1',
          chatId: 'chat-1',
          role: 'user',
          contentText: 'Persisted request',
          createdAt: '2026-03-12T09:01:00.000Z',
          sequence: 1,
        },
      ]),
      getChatSummary: jest.fn(async () => ({
        chatId: 'chat-1',
        schemaVersion: 1,
        source: 'local-recent-history-v1',
        summaryText: 'Existing summary',
        coveredThroughSequence: 1,
        updatedAt: '2026-03-12T09:02:00.000Z',
      })),
      upsertChatSummary: jest.fn(),
    };
    const repository = {
      withTransaction: jest.fn(async (operation) => operation(transactionalRepository)),
    };

    const service = new ChatMemoryService(repository as never);

    await expect(
      service.endLiveSession({
        id: 'live-session-1',
        status: 'ended',
      }),
    ).resolves.toEqual({
      id: 'live-session-1',
      chatId: 'chat-1',
      status: 'ended',
      endedAt: '2026-03-12T09:05:00.000Z',
    });

    expect(repository.withTransaction).toHaveBeenCalledTimes(1);
    expect(transactionalRepository.upsertChatSummary).not.toHaveBeenCalled();
  });
});
