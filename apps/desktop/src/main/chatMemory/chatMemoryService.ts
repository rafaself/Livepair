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
  UpdateLiveSessionRequest,
} from '@livepair/shared-types';
import { createChatMemoryDatabase } from './chatMemoryDatabase';
import {
  buildDurableChatSummary,
  shouldReplaceDurableChatSummary,
} from './chatSummary';
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

  listChats(): ChatRecord[] {
    return this.repository.listChats();
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

  updateLiveSession(request: UpdateLiveSessionRequest): LiveSessionRecord {
    return this.repository.updateLiveSession(request);
  }

  endLiveSession(request: EndLiveSessionRequest): LiveSessionRecord {
    const endedLiveSession = this.repository.endLiveSession(request);
    const nextSummary = buildDurableChatSummary({
      chatId: endedLiveSession.chatId,
      messages: this.repository.listMessages(endedLiveSession.chatId),
      updatedAt:
        endedLiveSession.endedAt
        ?? endedLiveSession.lastResumptionUpdateAt
        ?? new Date().toISOString(),
    });

    if (nextSummary === null) {
      return endedLiveSession;
    }

    const existingSummary = this.repository.getChatSummary(endedLiveSession.chatId);

    if (shouldReplaceDurableChatSummary(existingSummary, nextSummary)) {
      this.repository.upsertChatSummary(nextSummary);
    }

    return endedLiveSession;
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
