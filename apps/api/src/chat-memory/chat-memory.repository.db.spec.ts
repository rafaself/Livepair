import { DatabaseService } from '../database/database.service';
import {
  type ChatMessageRecord,
  type ChatRecord,
  type DurableChatSummaryRecord,
  type LiveSessionRecord,
} from '@livepair/shared-types';
import { randomUUID } from 'node:crypto';
import {
  buildDurableChatSummary,
  DURABLE_CHAT_SUMMARY_SCHEMA_VERSION,
  DURABLE_CHAT_SUMMARY_SOURCE,
} from './chat-summary';
import { PostgresChatMemoryRepository } from './chat-memory.repository';
import { describeWithDatabase, truncateChatMemoryTables } from './testing/database-test-utils';

describeWithDatabase('PostgresChatMemoryRepository', () => {
  let databaseService: DatabaseService;
  let repository: PostgresChatMemoryRepository;

  beforeAll(async () => {
    databaseService = new DatabaseService();
    await databaseService.checkConnection();
    repository = new PostgresChatMemoryRepository(databaseService);
  });

  beforeEach(async () => {
    await truncateChatMemoryTables(databaseService);
  });

  afterAll(async () => {
    await databaseService.onModuleDestroy();
  });

  it('creates and preserves a single durable current chat', async () => {
    const currentChat = await repository.getOrCreateCurrentChat();

    expect(currentChat.isCurrent).toBe(true);
    await expect(repository.getChat(currentChat.id)).resolves.toEqual(currentChat);
    await expect(repository.getOrCreateCurrentChat()).resolves.toEqual(currentChat);

    const nextChat = await repository.createChat({ title: 'Fresh chat' });

    expect(nextChat).toEqual({
      id: nextChat.id,
      title: 'Fresh chat',
      createdAt: nextChat.createdAt,
      updatedAt: nextChat.updatedAt,
      isCurrent: true,
    });
    await expect(repository.getChat(currentChat.id)).resolves.toEqual({
      ...currentChat,
      isCurrent: false,
    });
  });

  it('lists chats by updatedAt desc and messages by canonical sequence asc', async () => {
    const firstChat = await repository.getOrCreateCurrentChat();
    const secondChat = await repository.createChat({ title: 'Second chat' });

    await new Promise((resolve) => setTimeout(resolve, 5));

    const firstMessage = await repository.appendMessage({
      chatId: firstChat.id,
      role: 'user',
      contentText: 'First turn',
    });
    const secondMessage = await repository.appendMessage({
      chatId: firstChat.id,
      role: 'assistant',
      contentText: 'Second turn',
      answerMetadata: {
        provenance: 'unverified',
        confidence: 'low',
        reason: 'No verified grounding was stored for this reply.',
      },
    });

    await expect(repository.listMessages(firstChat.id)).resolves.toEqual([
      firstMessage,
      secondMessage,
    ]);

    const updatedFirstChat = (await repository.getChat(firstChat.id)) as ChatRecord;

    await expect(repository.listChats()).resolves.toEqual([updatedFirstChat, secondChat]);
  });

  it('round-trips optional answer metadata for persisted assistant messages', async () => {
    const chat = await repository.getOrCreateCurrentChat();

    const storedMessage = await repository.appendMessage({
      chatId: chat.id,
      role: 'assistant',
      contentText: 'Grounded answer',
      answerMetadata: {
        provenance: 'tool_grounded',
        confidence: 'high',
        reason: 'Confirmed from local runtime tool output.',
        thinkingText: 'Hidden assistant draft',
        citations: [
          {
            label: 'get_current_mode',
          },
        ],
      },
    });

    expect(storedMessage).toEqual(
      expect.objectContaining({
        answerMetadata: {
          provenance: 'tool_grounded',
          confidence: 'high',
          reason: 'Confirmed from local runtime tool output.',
          thinkingText: 'Hidden assistant draft',
          citations: [
            {
              label: 'get_current_mode',
            },
          ],
        },
      }),
    );

    await expect(repository.listMessages(chat.id)).resolves.toEqual([
      expect.objectContaining({
        id: storedMessage.id,
        answerMetadata: {
          provenance: 'tool_grounded',
          confidence: 'high',
          reason: 'Confirmed from local runtime tool output.',
          thinkingText: 'Hidden assistant draft',
          citations: [
            {
              label: 'get_current_mode',
            },
          ],
        },
      }),
    ]);
  });

  it('keeps older answer metadata records without thinking text compatible', async () => {
    const chat = await repository.getOrCreateCurrentChat();

    await repository.appendMessage({
      chatId: chat.id,
      role: 'assistant',
      contentText: 'Stored reply',
      answerMetadata: {
        provenance: 'unverified',
        reason: 'No verified evidence was attached to this reply.',
      },
    });

    await expect(repository.listMessages(chat.id)).resolves.toEqual([
      expect.objectContaining({
        role: 'assistant',
        contentText: 'Stored reply',
        answerMetadata: {
          provenance: 'unverified',
          reason: 'No verified evidence was attached to this reply.',
        },
      }),
    ]);
  });

  it('allocates deterministic per-chat sequences correctly under concurrent appends', async () => {
    const chat = await repository.getOrCreateCurrentChat();
    const concurrentMessages: ChatMessageRecord[] = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        repository.appendMessage({
          chatId: chat.id,
          role: index % 2 === 0 ? 'user' : 'assistant',
          contentText: `Concurrent turn ${index + 1}`,
        })),
    );

    expect(
      concurrentMessages.map((message) => message.sequence).sort((left, right) => left - right),
    ).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));

    const storedMessages: ChatMessageRecord[] = await repository.listMessages(chat.id);
    expect(storedMessages).toEqual(
      expect.arrayContaining(
        Array.from({ length: 12 }, (_, index) =>
          expect.objectContaining({
            chatId: chat.id,
            sequence: index + 1,
          })),
      ),
    );
    expect(storedMessages.map(({ sequence }) => sequence)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    );
  });

  it('supports bounded latest reads and still rejects missing chats', async () => {
    const chat = await repository.getOrCreateCurrentChat();
    const firstMessage = await repository.appendMessage({
      chatId: chat.id,
      role: 'user',
      contentText: 'First turn',
    });
    const secondMessage = await repository.appendMessage({
      chatId: chat.id,
      role: 'assistant',
      contentText: 'Second turn',
    });
    const firstLiveSession = await repository.createLiveSession({
      chatId: chat.id,
      voice: 'Puck',
      startedAt: '2026-03-12T09:00:00.000Z',
    });
    const secondLiveSession = await repository.createLiveSession({
      chatId: chat.id,
      voice: 'Kore',
      startedAt: '2026-03-12T10:00:00.000Z',
    });

    await expect(repository.listMessages(chat.id, { limit: 1 })).resolves.toEqual([
      secondMessage,
    ]);
    await expect(repository.listMessages(chat.id, { limit: 2 })).resolves.toEqual([
      firstMessage,
      secondMessage,
    ]);
    await expect(repository.listLiveSessions(chat.id, { limit: 1 })).resolves.toEqual([
      secondLiveSession,
    ]);

    const missingChatId = randomUUID();
    await expect(repository.listMessages(missingChatId)).rejects.toThrow(
      `Chat not found: ${missingChatId}`,
    );
    await expect(repository.getChatSummary(missingChatId)).rejects.toThrow(
      `Chat not found: ${missingChatId}`,
    );
    await expect(repository.listLiveSessions(missingChatId)).rejects.toThrow(
      `Chat not found: ${missingChatId}`,
    );

    await expect(repository.listLiveSessions(chat.id)).resolves.toEqual([
      secondLiveSession,
      firstLiveSession,
    ]);
  });

  it('creates, lists, updates, and ends live sessions while preserving canonical messages', async () => {
    const chat = await repository.getOrCreateCurrentChat();
    await repository.appendMessage({
      chatId: chat.id,
      role: 'user',
      contentText: 'Keep this history intact',
    });

    const firstLiveSession: LiveSessionRecord = await repository.createLiveSession({
      chatId: chat.id,
      voice: 'Puck',
      startedAt: '2026-03-12T09:00:00.000Z',
    });
    const secondLiveSession: LiveSessionRecord = await repository.createLiveSession({
      chatId: chat.id,
      voice: 'Kore',
      startedAt: '2026-03-12T10:00:00.000Z',
    });

    await expect(repository.listLiveSessions(chat.id)).resolves.toEqual([
      secondLiveSession,
      firstLiveSession,
    ]);

    const snapshotUpdatedLiveSession = await repository.updateLiveSession({
      kind: 'snapshot',
      id: firstLiveSession.id,
      summarySnapshot: 'Persisted summary snapshot',
      contextStateSnapshot: {
        task: {
          entries: [{ key: 'taskStatus', value: 'active' }],
        },
        context: {
          entries: [{ key: 'repo', value: 'Livepair' }],
        },
      },
    });

    expect(snapshotUpdatedLiveSession).toEqual({
      ...firstLiveSession,
      summarySnapshot: 'Persisted summary snapshot',
      contextStateSnapshot: {
        task: {
          entries: [{ key: 'taskStatus', value: 'active' }],
        },
        context: {
          entries: [{ key: 'repo', value: 'Livepair' }],
        },
      },
    });

    const resumptionUpdatedLiveSession = await repository.updateLiveSession({
      kind: 'resumption',
      id: firstLiveSession.id,
      resumptionHandle: 'handles/live-session-1',
      restorable: true,
      lastResumptionUpdateAt: '2026-03-12T09:01:00.000Z',
    });

    expect(resumptionUpdatedLiveSession).toEqual({
      ...firstLiveSession,
      resumptionHandle: 'handles/live-session-1',
      lastResumptionUpdateAt: '2026-03-12T09:01:00.000Z',
      restorable: true,
      invalidatedAt: null,
      invalidationReason: null,
      summarySnapshot: 'Persisted summary snapshot',
      contextStateSnapshot: {
        task: {
          entries: [{ key: 'taskStatus', value: 'active' }],
        },
        context: {
          entries: [{ key: 'repo', value: 'Livepair' }],
        },
      },
    });

    const endedLiveSession = await repository.endLiveSession({
      id: firstLiveSession.id,
      status: 'ended',
      endedAt: '2026-03-12T09:05:00.000Z',
      endedReason: 'user-ended',
    });

    expect(endedLiveSession).toEqual({
      ...firstLiveSession,
      endedAt: '2026-03-12T09:05:00.000Z',
      status: 'ended',
      endedReason: 'user-ended',
      resumptionHandle: null,
      lastResumptionUpdateAt: '2026-03-12T09:05:00.000Z',
      restorable: false,
      invalidatedAt: '2026-03-12T09:05:00.000Z',
      invalidationReason: 'user-ended',
      summarySnapshot: 'Persisted summary snapshot',
      contextStateSnapshot: {
        task: {
          entries: [{ key: 'taskStatus', value: 'active' }],
        },
        context: {
          entries: [{ key: 'repo', value: 'Livepair' }],
        },
      },
    });

    await expect(repository.listMessages(chat.id)).resolves.toEqual([
      expect.objectContaining({
        chatId: chat.id,
        role: 'user',
        contentText: 'Keep this history intact',
      }),
    ]);
  });

  it('persists live-session voice so existing chats can keep their assistant voice', async () => {
    const chat = await repository.getOrCreateCurrentChat();

    const liveSession = await repository.createLiveSession({
      chatId: chat.id,
      voice: 'Aoede',
      startedAt: '2026-03-12T09:00:00.000Z',
    });

    expect(liveSession).toEqual(
      expect.objectContaining({
        chatId: chat.id,
        voice: 'Aoede',
      }),
    );

    await expect(repository.listLiveSessions(chat.id)).resolves.toEqual([
      expect.objectContaining({
        id: liveSession.id,
        voice: 'Aoede',
      }),
    ]);

    await expect(
      repository.endLiveSession({
        id: liveSession.id,
        status: 'ended',
        endedAt: '2026-03-12T09:05:00.000Z',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: liveSession.id,
        voice: 'Aoede',
        status: 'ended',
      }),
    );
  });

  it('gets and upserts durable chat summaries', async () => {
    const chat = await repository.getOrCreateCurrentChat();

    await expect(repository.getChatSummary(chat.id)).resolves.toBeNull();

    const summary: DurableChatSummaryRecord = {
      chatId: chat.id,
      schemaVersion: DURABLE_CHAT_SUMMARY_SCHEMA_VERSION,
      source: DURABLE_CHAT_SUMMARY_SOURCE,
      summaryText: 'Compact continuity summary',
      coveredThroughSequence: 2,
      updatedAt: '2026-03-12T09:05:00.000Z',
    };

    await expect(repository.upsertChatSummary(summary)).resolves.toEqual(summary);
    await expect(repository.getChatSummary(chat.id)).resolves.toEqual(summary);

    const replacedSummary = buildDurableChatSummary({
      chatId: chat.id,
      messages: [
        {
          id: 'message-1',
          chatId: chat.id,
          role: 'user',
          contentText: 'Persisted request',
          createdAt: '2026-03-12T09:01:00.000Z',
          sequence: 1,
        },
      ],
      updatedAt: '2026-03-12T09:06:00.000Z',
    });

    expect(replacedSummary).not.toBeNull();
    await expect(repository.upsertChatSummary(replacedSummary!)).resolves.toEqual(replacedSummary);
    await expect(repository.getChatSummary(chat.id)).resolves.toEqual(replacedSummary);
  });
});
