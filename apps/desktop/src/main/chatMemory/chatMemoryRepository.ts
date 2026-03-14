import type { Database as SqliteDatabase } from 'better-sqlite3';
import type {
  AppendChatMessageRequest,
  ChatId,
  ChatMessageRecord,
  ChatRecord,
  CreateChatRequest,
  DurableChatSummaryRecord,
  CreateLiveSessionRequest,
  EndLiveSessionRequest,
  LiveSessionRecord,
  UpdateLiveSessionRequest,
} from '@livepair/shared-types';
import {
  createChatMemoryChatStore,
  type ChatMemoryChatStore,
} from './chatMemoryChatStore';
import {
  createChatMemoryLiveSessionStore,
  type ChatMemoryLiveSessionStore,
} from './chatMemoryLiveSessionStore';
import {
  createChatMemoryMessageStore,
  type ChatMemoryMessageStore,
} from './chatMemoryMessageStore';
import { prepareChatMemoryRepositoryStatements } from './chatMemoryRepositoryStatements';
import {
  createChatMemorySummaryStore,
  type ChatMemorySummaryStore,
} from './chatMemorySummaryStore';

export interface ChatMemoryRepository {
  createChat: (request?: CreateChatRequest) => ChatRecord;
  getChat: (chatId: ChatId) => ChatRecord | null;
  getOrCreateCurrentChat: () => ChatRecord;
  listChats: () => ChatRecord[];
  listMessages: (chatId: ChatId) => ChatMessageRecord[];
  getChatSummary: (chatId: ChatId) => DurableChatSummaryRecord | null;
  appendMessage: (request: AppendChatMessageRequest) => ChatMessageRecord;
  createLiveSession: (request: CreateLiveSessionRequest) => LiveSessionRecord;
  listLiveSessions: (chatId: ChatId) => LiveSessionRecord[];
  upsertChatSummary: (summary: DurableChatSummaryRecord) => DurableChatSummaryRecord;
  updateLiveSession: (request: UpdateLiveSessionRequest) => LiveSessionRecord;
  endLiveSession: (request: EndLiveSessionRequest) => LiveSessionRecord;
}

export class SqliteChatMemoryRepository implements ChatMemoryRepository {
  private readonly chats: ChatMemoryChatStore;
  private readonly messages: ChatMemoryMessageStore;
  private readonly summaries: ChatMemorySummaryStore;
  private readonly liveSessions: ChatMemoryLiveSessionStore;

  constructor(database: SqliteDatabase) {
    const statements = prepareChatMemoryRepositoryStatements(database);
    const chats = createChatMemoryChatStore({ database, statements });

    this.chats = chats;
    this.messages = createChatMemoryMessageStore({
      database,
      statements,
      getChat: chats.getChat,
      touchChat: chats.touchChat,
    });
    this.summaries = createChatMemorySummaryStore({
      statements,
      getChat: chats.getChat,
    });
    this.liveSessions = createChatMemoryLiveSessionStore({
      database,
      statements,
      getChat: chats.getChat,
    });
  }

  createChat(request?: CreateChatRequest): ChatRecord {
    return this.chats.createChat(request);
  }

  getChat(chatId: ChatId): ChatRecord | null {
    return this.chats.getChat(chatId);
  }

  getOrCreateCurrentChat(): ChatRecord {
    return this.chats.getOrCreateCurrentChat();
  }

  listChats(): ChatRecord[] {
    return this.chats.listChats();
  }

  listMessages(chatId: ChatId): ChatMessageRecord[] {
    return this.messages.listMessages(chatId);
  }

  getChatSummary(chatId: ChatId): DurableChatSummaryRecord | null {
    return this.summaries.getChatSummary(chatId);
  }

  appendMessage(request: AppendChatMessageRequest): ChatMessageRecord {
    return this.messages.appendMessage(request);
  }

  createLiveSession(request: CreateLiveSessionRequest): LiveSessionRecord {
    return this.liveSessions.createLiveSession(request);
  }

  listLiveSessions(chatId: ChatId): LiveSessionRecord[] {
    return this.liveSessions.listLiveSessions(chatId);
  }

  upsertChatSummary(summary: DurableChatSummaryRecord): DurableChatSummaryRecord {
    return this.summaries.upsertChatSummary(summary);
  }

  updateLiveSession(request: UpdateLiveSessionRequest): LiveSessionRecord {
    return this.liveSessions.updateLiveSession(request);
  }

  endLiveSession(request: EndLiveSessionRequest): LiveSessionRecord {
    return this.liveSessions.endLiveSession(request);
  }
}
