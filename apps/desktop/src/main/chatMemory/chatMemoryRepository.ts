import { randomUUID } from 'node:crypto';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type {
  AppendChatMessageRequest,
  ChatId,
  ChatMessageRecord,
  ChatRecord,
  CreateChatRequest,
} from '@livepair/shared-types';

type ChatRow = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  is_current: number;
};

type MessageRow = {
  id: string;
  chat_id: string;
  role: ChatMessageRecord['role'];
  content_text: string;
  created_at: string;
  sequence: number;
};

export interface ChatMemoryRepository {
  createChat: (request?: CreateChatRequest) => ChatRecord;
  getChat: (chatId: ChatId) => ChatRecord | null;
  getOrCreateCurrentChat: () => ChatRecord;
  listMessages: (chatId: ChatId) => ChatMessageRecord[];
  appendMessage: (request: AppendChatMessageRequest) => ChatMessageRecord;
}

function toChatRecord(row: ChatRow): ChatRecord {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isCurrent: row.is_current === 1,
  };
}

function toChatMessageRecord(row: MessageRow): ChatMessageRecord {
  return {
    id: row.id,
    chatId: row.chat_id,
    role: row.role,
    contentText: row.content_text,
    createdAt: row.created_at,
    sequence: row.sequence,
  };
}

function normalizeTitle(title: string | null | undefined): string | null {
  if (typeof title !== 'string') {
    return title ?? null;
  }

  const trimmedTitle = title.trim();
  return trimmedTitle.length > 0 ? trimmedTitle : null;
}

function normalizeContentText(contentText: string): string {
  const trimmedContent = contentText.trim();

  if (trimmedContent.length === 0) {
    throw new Error('Chat message content must not be empty');
  }

  return trimmedContent;
}

export class SqliteChatMemoryRepository implements ChatMemoryRepository {
  private readonly selectChatByIdStatement;
  private readonly selectCurrentChatStatement;
  private readonly listMessagesByChatIdStatement;
  private readonly demoteCurrentChatsStatement;
  private readonly insertChatStatement;
  private readonly updateChatTimestampStatement;
  private readonly nextSequenceStatement;
  private readonly insertMessageStatement;

  constructor(private readonly database: SqliteDatabase) {
    this.selectChatByIdStatement = database.prepare(
      'SELECT id, title, created_at, updated_at, is_current FROM chats WHERE id = ?',
    );
    this.selectCurrentChatStatement = database.prepare(
      'SELECT id, title, created_at, updated_at, is_current FROM chats WHERE is_current = 1 LIMIT 1',
    );
    this.listMessagesByChatIdStatement = database.prepare(
      'SELECT id, chat_id, role, content_text, created_at, sequence FROM messages WHERE chat_id = ? ORDER BY sequence ASC, id ASC',
    );
    this.demoteCurrentChatsStatement = database.prepare(
      'UPDATE chats SET is_current = 0 WHERE is_current = 1',
    );
    this.insertChatStatement = database.prepare(`
      INSERT INTO chats (id, created_at, updated_at, title, is_current)
      VALUES (@id, @createdAt, @updatedAt, @title, @isCurrent)
    `);
    this.updateChatTimestampStatement = database.prepare(
      'UPDATE chats SET updated_at = ? WHERE id = ?',
    );
    this.nextSequenceStatement = database.prepare(
      'SELECT COALESCE(MAX(sequence), 0) + 1 AS nextSequence FROM messages WHERE chat_id = ?',
    );
    this.insertMessageStatement = database.prepare(`
      INSERT INTO messages (id, chat_id, role, content_text, created_at, sequence)
      VALUES (@id, @chatId, @role, @contentText, @createdAt, @sequence)
    `);
  }

  createChat(request?: CreateChatRequest): ChatRecord {
    const createChat = this.database.transaction((input?: CreateChatRequest) => {
      const timestamp = new Date().toISOString();
      const chatRow: ChatRow = {
        id: randomUUID(),
        title: normalizeTitle(input?.title),
        created_at: timestamp,
        updated_at: timestamp,
        is_current: 1,
      };

      this.demoteCurrentChatsStatement.run();
      this.insertChatStatement.run({
        id: chatRow.id,
        createdAt: chatRow.created_at,
        updatedAt: chatRow.updated_at,
        title: chatRow.title,
        isCurrent: chatRow.is_current,
      });

      return toChatRecord(chatRow);
    });

    return createChat(request);
  }

  getChat(chatId: ChatId): ChatRecord | null {
    const row = this.selectChatByIdStatement.get(chatId) as ChatRow | undefined;
    return row ? toChatRecord(row) : null;
  }

  getOrCreateCurrentChat(): ChatRecord {
    const ensureCurrentChat = this.database.transaction(() => {
      const existingRow = this.selectCurrentChatStatement.get() as ChatRow | undefined;

      if (existingRow) {
        return toChatRecord(existingRow);
      }

      return this.createChat();
    });

    return ensureCurrentChat();
  }

  listMessages(chatId: ChatId): ChatMessageRecord[] {
    return (
      this.listMessagesByChatIdStatement.all(chatId) as MessageRow[]
    ).map((row) => toChatMessageRecord(row));
  }

  appendMessage(request: AppendChatMessageRequest): ChatMessageRecord {
    const appendMessage = this.database.transaction((input: AppendChatMessageRequest) => {
      const chat = this.getChat(input.chatId);

      if (!chat) {
        throw new Error(`Chat not found: ${input.chatId}`);
      }

      const createdAt = new Date().toISOString();
      const nextSequenceRow = this.nextSequenceStatement.get(input.chatId) as {
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

      this.insertMessageStatement.run({
        id: messageRow.id,
        chatId: messageRow.chat_id,
        role: messageRow.role,
        contentText: messageRow.content_text,
        createdAt: messageRow.created_at,
        sequence: messageRow.sequence,
      });
      this.updateChatTimestampStatement.run(createdAt, input.chatId);

      return toChatMessageRecord(messageRow);
    });

    return appendMessage(request);
  }
}
