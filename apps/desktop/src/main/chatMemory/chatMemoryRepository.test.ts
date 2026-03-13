// @vitest-environment node
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { createChatMemoryDatabase } from './chatMemoryDatabase';
import { SqliteChatMemoryRepository } from './chatMemoryRepository';

describe('SqliteChatMemoryRepository', () => {
  let databaseFilePath: string;
  const openDatabases: SqliteDatabase[] = [];

  const openRepository = () => {
    const database = createChatMemoryDatabase(databaseFilePath);
    openDatabases.push(database);
    return new SqliteChatMemoryRepository(database);
  };

  beforeEach(async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'livepair-chat-memory-repo-'));
    databaseFilePath = join(rootDir, 'chat-memory.sqlite');
  });

  afterEach(() => {
    while (openDatabases.length > 0) {
      openDatabases.pop()?.close();
    }
  });

  it('creates chats and reloads the current chat across database reopen', () => {
    const repository = openRepository();

    const currentChat = repository.getOrCreateCurrentChat();
    expect(currentChat.isCurrent).toBe(true);
    expect(repository.getChat(currentChat.id)).toEqual(currentChat);

    const reopenedRepository = openRepository();
    expect(reopenedRepository.getOrCreateCurrentChat()).toEqual(currentChat);
  });

  it('persists messages and returns them in deterministic sequence order after reload', () => {
    const repository = openRepository();
    const chat = repository.getOrCreateCurrentChat();

    const firstMessage = repository.appendMessage({
      chatId: chat.id,
      role: 'user',
      contentText: 'First turn',
    });
    const secondMessage = repository.appendMessage({
      chatId: chat.id,
      role: 'assistant',
      contentText: 'Second turn',
    });
    const thirdMessage = repository.appendMessage({
      chatId: chat.id,
      role: 'user',
      contentText: 'Third turn',
    });

    expect(repository.listMessages(chat.id)).toEqual([
      firstMessage,
      secondMessage,
      thirdMessage,
    ]);

    const reopenedRepository = openRepository();
    expect(reopenedRepository.listMessages(chat.id)).toEqual([
      { ...firstMessage, sequence: 1 },
      { ...secondMessage, sequence: 2 },
      { ...thirdMessage, sequence: 3 },
    ]);
  });

  it('creates a new chat and marks it as the current chat', () => {
    const repository = openRepository();
    const initialChat = repository.getOrCreateCurrentChat();

    const nextChat = repository.createChat({ title: 'Fresh chat' });

    expect(nextChat).toEqual({
      id: nextChat.id,
      title: 'Fresh chat',
      createdAt: nextChat.createdAt,
      updatedAt: nextChat.updatedAt,
      isCurrent: true,
    });
    expect(repository.getChat(initialChat.id)).toEqual({
      ...initialChat,
      isCurrent: false,
    });
    expect(repository.getChat(nextChat.id)).toEqual(nextChat);
  });

  it('creates and lists multiple historical live sessions for a chat', () => {
    const repository = openRepository();
    const chat = repository.getOrCreateCurrentChat();

    const firstLiveSession = repository.createLiveSession({
      chatId: chat.id,
      startedAt: '2026-03-12T09:00:00.000Z',
    });
    const secondLiveSession = repository.createLiveSession({
      chatId: chat.id,
      startedAt: '2026-03-12T10:00:00.000Z',
    });

    expect(repository.listLiveSessions(chat.id)).toEqual([
      secondLiveSession,
      firstLiveSession,
    ]);

    const reopenedRepository = openRepository();
    expect(reopenedRepository.listLiveSessions(chat.id)).toEqual([
      secondLiveSession,
      firstLiveSession,
    ]);
  });

  it('ends a persisted live session without affecting canonical chat messages', () => {
    const repository = openRepository();
    const chat = repository.getOrCreateCurrentChat();
    repository.appendMessage({
      chatId: chat.id,
      role: 'user',
      contentText: 'Keep this history intact',
    });

    const liveSession = repository.createLiveSession({
      chatId: chat.id,
      startedAt: '2026-03-12T09:00:00.000Z',
    });
    const endedLiveSession = repository.endLiveSession({
      id: liveSession.id,
      status: 'ended',
      endedAt: '2026-03-12T09:05:00.000Z',
      endedReason: 'user-ended',
    });

    expect(endedLiveSession).toEqual({
      ...liveSession,
      endedAt: '2026-03-12T09:05:00.000Z',
      status: 'ended',
      endedReason: 'user-ended',
      resumptionHandle: null,
      lastResumptionUpdateAt: '2026-03-12T09:05:00.000Z',
      restorable: false,
      invalidatedAt: '2026-03-12T09:05:00.000Z',
      invalidationReason: 'user-ended',
    });
    expect(repository.listMessages(chat.id)).toEqual([
      expect.objectContaining({
        chatId: chat.id,
        role: 'user',
        contentText: 'Keep this history intact',
      }),
    ]);
  });

  it('updates live-session restore metadata without changing canonical chat history', () => {
    const repository = openRepository();
    const chat = repository.getOrCreateCurrentChat();
    repository.appendMessage({
      chatId: chat.id,
      role: 'assistant',
      contentText: 'Keep this answer intact',
    });

    const liveSession = repository.createLiveSession({
      chatId: chat.id,
      startedAt: '2026-03-12T09:00:00.000Z',
    });
    const updatedLiveSession = repository.updateLiveSession({
      id: liveSession.id,
      resumptionHandle: 'handles/live-session-1',
      restorable: true,
    });

    expect(updatedLiveSession).toEqual({
      ...liveSession,
      resumptionHandle: 'handles/live-session-1',
      lastResumptionUpdateAt: expect.any(String),
      restorable: true,
      invalidatedAt: null,
      invalidationReason: null,
    });
    expect(repository.listLiveSessions(chat.id)).toEqual([
      {
        ...liveSession,
        resumptionHandle: 'handles/live-session-1',
        lastResumptionUpdateAt: expect.any(String),
        restorable: true,
        invalidatedAt: null,
        invalidationReason: null,
      },
    ]);
    expect(repository.listMessages(chat.id)).toEqual([
      expect.objectContaining({
        chatId: chat.id,
        role: 'assistant',
        contentText: 'Keep this answer intact',
      }),
    ]);
  });

  it('marks a live session as non-restorable when resumption metadata is invalidated', () => {
    const repository = openRepository();
    const chat = repository.getOrCreateCurrentChat();
    const liveSession = repository.createLiveSession({
      chatId: chat.id,
      startedAt: '2026-03-12T09:00:00.000Z',
    });

    const updatedLiveSession = repository.updateLiveSession({
      id: liveSession.id,
      resumptionHandle: null,
      restorable: false,
      invalidationReason: 'Gemini Live session is not resumable at this point',
    });

    expect(updatedLiveSession).toEqual({
      ...liveSession,
      resumptionHandle: null,
      lastResumptionUpdateAt: expect.any(String),
      restorable: false,
      invalidatedAt: expect.any(String),
      invalidationReason: 'Gemini Live session is not resumable at this point',
    });
  });

  it('clears stale resume handles when a live session becomes non-restorable', () => {
    const repository = openRepository();
    const chat = repository.getOrCreateCurrentChat();
    const liveSession = repository.createLiveSession({
      chatId: chat.id,
      startedAt: '2026-03-12T09:00:00.000Z',
    });

    repository.updateLiveSession({
      id: liveSession.id,
      resumptionHandle: 'handles/live-session-1',
      restorable: true,
    });

    const invalidatedLiveSession = repository.updateLiveSession({
      id: liveSession.id,
      resumptionHandle: 'handles/stale-live-session-1',
      restorable: false,
      invalidatedAt: '2026-03-12T09:02:00.000Z',
      invalidationReason: 'Gemini Live session is not resumable at this point',
    });

    expect(invalidatedLiveSession).toEqual({
      ...liveSession,
      resumptionHandle: null,
      lastResumptionUpdateAt: expect.any(String),
      restorable: false,
      invalidatedAt: '2026-03-12T09:02:00.000Z',
      invalidationReason: 'Gemini Live session is not resumable at this point',
    });
  });

  it('persists live-session summary and context snapshots across reload', () => {
    const repository = openRepository();
    const chat = repository.getOrCreateCurrentChat();
    const liveSession = repository.createLiveSession({
      chatId: chat.id,
      startedAt: '2026-03-12T09:00:00.000Z',
    });

    const updatedLiveSession = repository.updateLiveSession({
      id: liveSession.id,
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

    expect(updatedLiveSession).toEqual({
      ...liveSession,
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

    const reopenedRepository = openRepository();
    expect(reopenedRepository.listLiveSessions(chat.id)).toEqual([
      {
        ...liveSession,
        summarySnapshot: 'Persisted summary snapshot',
        contextStateSnapshot: {
          task: {
            entries: [{ key: 'taskStatus', value: 'active' }],
          },
          context: {
            entries: [{ key: 'repo', value: 'Livepair' }],
          },
        },
      },
    ]);
  });

  it('ignores malformed persisted context snapshots instead of throwing on reload', () => {
    const repository = openRepository();
    const database = openDatabases[openDatabases.length - 1]!;
    const chat = repository.getOrCreateCurrentChat();
    const liveSession = repository.createLiveSession({
      chatId: chat.id,
      startedAt: '2026-03-12T09:00:00.000Z',
    });

    database
      .prepare('UPDATE live_sessions SET context_state_snapshot = ? WHERE id = ?')
      .run('{', liveSession.id);

    const reopenedRepository = openRepository();

    expect(reopenedRepository.listLiveSessions(chat.id)).toEqual([liveSession]);
  });

  it('ignores persisted context snapshots with the wrong runtime shape', () => {
    const repository = openRepository();
    const database = openDatabases[openDatabases.length - 1]!;
    const chat = repository.getOrCreateCurrentChat();
    const liveSession = repository.createLiveSession({
      chatId: chat.id,
      startedAt: '2026-03-12T09:00:00.000Z',
    });

    database
      .prepare('UPDATE live_sessions SET context_state_snapshot = ? WHERE id = ?')
      .run(JSON.stringify({ task: null, context: { entries: [] } }), liveSession.id);

    const reopenedRepository = openRepository();

    expect(reopenedRepository.listLiveSessions(chat.id)).toEqual([liveSession]);
  });
});
