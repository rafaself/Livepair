import { randomUUID } from 'node:crypto';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type {
  AppendChatMessageRequest,
  ChatId,
  ChatMessageRecord,
  ChatRecord,
} from '@livepair/shared-types';
import { normalizeContentText } from './chatMemoryNormalization';
import type { ChatMemoryRepositoryStatements } from './chatMemoryRepositoryStatements';
import { toChatMessageRecord } from './rowMappers';
import type { MessageRow } from './rowMappers';

type ChatLookup = (chatId: ChatId) => ChatRecord | null;
type ChatTouch = (chatId: ChatId, updatedAt: string) => void;

export type ChatMemoryMessageStore = {
  listMessages: (chatId: ChatId) => ChatMessageRecord[];
  appendMessage: (request: AppendChatMessageRequest) => ChatMessageRecord;
};

export function createChatMemoryMessageStore({
  database,
  statements,
  getChat,
  touchChat,
}: {
  database: SqliteDatabase;
  statements: ChatMemoryRepositoryStatements;
  getChat: ChatLookup;
  touchChat: ChatTouch;
}): ChatMemoryMessageStore {
  const listMessages = (chatId: ChatId): ChatMessageRecord[] => {
    return (
      statements.listMessagesByChatId.all(chatId) as MessageRow[]
    ).map((row) => toChatMessageRecord(row));
  };

  const appendMessage = database.transaction((input: AppendChatMessageRequest) => {
    const chat = getChat(input.chatId);

    if (!chat) {
      throw new Error(`Chat not found: ${input.chatId}`);
    }

    const createdAt = new Date().toISOString();
    const nextSequenceRow = statements.nextMessageSequence.get(input.chatId) as {
      nextSequence: number;
    };
    const messageRow: MessageRow = {
      id: randomUUID(),
      chat_id: input.chatId,
      role: input.role,
      content_text: normalizeContentText(input.contentText),
      created_at: createdAt,
      sequence: nextSequenceRow.nextSequence,
    };

    statements.insertMessage.run({
      id: messageRow.id,
      chatId: messageRow.chat_id,
      role: messageRow.role,
      contentText: messageRow.content_text,
      createdAt: messageRow.created_at,
      sequence: messageRow.sequence,
    });
    touchChat(input.chatId, createdAt);

    return toChatMessageRecord(messageRow);
  });

  return {
    listMessages,
    appendMessage,
  };
}
