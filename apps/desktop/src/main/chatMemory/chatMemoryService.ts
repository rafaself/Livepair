import { app } from 'electron';
import { join } from 'node:path';
import type {
  AppendChatMessageRequest,
  ChatId,
  ChatMessageRecord,
  ChatRecord,
  CreateChatRequest,
  CreateLiveSessionRequest,
  EndLiveSessionRequest,
  LiveSessionRecord,
} from '@livepair/shared-types';
import { createChatMemoryDatabase } from './chatMemoryDatabase';
import {
  type ChatMemoryRepository,
  SqliteChatMemoryRepository,
} from './chatMemoryRepository';

export class ChatMemoryService {
  constructor(private readonly repository: ChatMemoryRepository) {}

  createChat(request?: CreateChatRequest): ChatRecord {
    return this.repository.createChat(request);
  }

  getChat(chatId: ChatId): ChatRecord | null {
    return this.repository.getChat(chatId);
  }

  getOrCreateCurrentChat(): ChatRecord {
    return this.repository.getOrCreateCurrentChat();
  }

  listMessages(chatId: ChatId): ChatMessageRecord[] {
    return this.repository.listMessages(chatId);
  }

  appendMessage(request: AppendChatMessageRequest): ChatMessageRecord {
    return this.repository.appendMessage(request);
  }

  createLiveSession(request: CreateLiveSessionRequest): LiveSessionRecord {
    return this.repository.createLiveSession(request);
  }

  listLiveSessions(chatId: ChatId): LiveSessionRecord[] {
    return this.repository.listLiveSessions(chatId);
  }

  endLiveSession(request: EndLiveSessionRequest): LiveSessionRecord {
    return this.repository.endLiveSession(request);
  }
}

let chatMemoryService: ChatMemoryService | null = null;

export function getChatMemoryService(): ChatMemoryService {
  if (chatMemoryService === null) {
    const database = createChatMemoryDatabase(join(app.getPath('userData'), 'chat-memory.sqlite'));
    const repository = new SqliteChatMemoryRepository(database);
    chatMemoryService = new ChatMemoryService(repository);
  }

  return chatMemoryService;
}
