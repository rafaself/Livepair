import { randomUUID } from 'node:crypto';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { ChatId, ChatRecord, CreateChatRequest } from '@livepair/shared-types';
import { normalizeTitle } from './chatMemoryNormalization';
import type { ChatMemoryRepositoryStatements } from './chatMemoryRepositoryStatements';
import { toChatRecord } from './rowMappers';
import type { ChatRow } from './rowMappers';

export type ChatMemoryChatStore = {
  createChat: (request?: CreateChatRequest) => ChatRecord;
  getChat: (chatId: ChatId) => ChatRecord | null;
  getOrCreateCurrentChat: () => ChatRecord;
  listChats: () => ChatRecord[];
  touchChat: (chatId: ChatId, updatedAt: string) => void;
};

export function createChatMemoryChatStore({
  database,
  statements,
}: {
  database: SqliteDatabase;
  statements: ChatMemoryRepositoryStatements;
}): ChatMemoryChatStore {
  const getChat = (chatId: ChatId): ChatRecord | null => {
    const row = statements.selectChatById.get(chatId) as ChatRow | undefined;
    return row ? toChatRecord(row) : null;
  };

  const touchChat = (chatId: ChatId, updatedAt: string): void => {
    statements.updateChatTimestamp.run(updatedAt, chatId);
  };

  const createChat = database.transaction((input?: CreateChatRequest) => {
    const timestamp = new Date().toISOString();
    const chatRow: ChatRow = {
      id: randomUUID(),
      title: normalizeTitle(input?.title),
      created_at: timestamp,
      updated_at: timestamp,
      is_current: 1,
    };

    statements.demoteCurrentChats.run();
    statements.insertChat.run({
      id: chatRow.id,
      createdAt: chatRow.created_at,
      updatedAt: chatRow.updated_at,
      title: chatRow.title,
      isCurrent: chatRow.is_current,
    });

    return toChatRecord(chatRow);
  });

  const getOrCreateCurrentChat = database.transaction(() => {
    const existingRow = statements.selectCurrentChat.get() as ChatRow | undefined;

    if (existingRow) {
      return toChatRecord(existingRow);
    }

    return createChat();
  });

  const listChats = (): ChatRecord[] => {
    return (statements.listAllChats.all() as ChatRow[]).map((row) => toChatRecord(row));
  };

  return {
    createChat,
    getChat,
    getOrCreateCurrentChat,
    listChats,
    touchChat,
  };
}
