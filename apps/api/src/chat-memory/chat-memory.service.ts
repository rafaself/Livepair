import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AppendChatMessageRequest,
  ChatId,
  ChatMemoryListOptions,
  ChatMessageRecord,
  ChatRecord,
  CreateChatRequest,
  CreateLiveSessionRequest,
  DurableChatSummaryRecord,
  EndLiveSessionRequest,
  LiveSessionRecord,
  UpdateLiveSessionRequest,
} from '@livepair/shared-types';
import {
  ChatMemoryInputError,
  ChatMemoryNotFoundError,
} from './chat-memory.errors';
import {
  PostgresChatMemoryRepository,
} from './chat-memory.repository';
import {
  buildDurableChatSummary,
  shouldReplaceDurableChatSummary,
} from './chat-summary';

@Injectable()
export class ChatMemoryService {
  constructor(private readonly repository: PostgresChatMemoryRepository) {}

  createChat(request?: CreateChatRequest): Promise<ChatRecord> {
    return this.run(() => this.repository.createChat(request));
  }

  getChat(chatId: ChatId): Promise<ChatRecord | null> {
    return this.run(() => this.repository.getChat(chatId));
  }

  getOrCreateCurrentChat(): Promise<ChatRecord> {
    return this.run(() => this.repository.getOrCreateCurrentChat());
  }

  listChats(): Promise<ChatRecord[]> {
    return this.run(() => this.repository.listChats());
  }

  listMessages(
    chatId: ChatId,
    options?: ChatMemoryListOptions,
  ): Promise<ChatMessageRecord[]> {
    return this.run(() => this.repository.listMessages(chatId, options));
  }

  getChatSummary(chatId: ChatId): Promise<DurableChatSummaryRecord | null> {
    return this.run(() => this.repository.getChatSummary(chatId));
  }

  appendMessage(request: AppendChatMessageRequest): Promise<ChatMessageRecord> {
    return this.run(() => this.repository.appendMessage(request));
  }

  createLiveSession(request: CreateLiveSessionRequest): Promise<LiveSessionRecord> {
    return this.run(() => this.repository.createLiveSession(request));
  }

  listLiveSessions(
    chatId: ChatId,
    options?: ChatMemoryListOptions,
  ): Promise<LiveSessionRecord[]> {
    return this.run(() => this.repository.listLiveSessions(chatId, options));
  }

  updateLiveSession(request: UpdateLiveSessionRequest): Promise<LiveSessionRecord> {
    return this.run(() => this.repository.updateLiveSession(request));
  }

  endLiveSession(request: EndLiveSessionRequest): Promise<LiveSessionRecord> {
    return this.run(() =>
      this.repository.withTransaction(async (transactionalRepository) => {
        const endedLiveSession = await transactionalRepository.endLiveSession(request);
        const nextSummary = buildDurableChatSummary({
          chatId: endedLiveSession.chatId,
          messages: await transactionalRepository.listMessages(endedLiveSession.chatId),
          updatedAt:
            endedLiveSession.endedAt ??
            endedLiveSession.lastResumptionUpdateAt ??
            new Date().toISOString(),
        });

        if (nextSummary === null) {
          return endedLiveSession;
        }

        const existingSummary = await transactionalRepository.getChatSummary(
          endedLiveSession.chatId,
        );

        if (shouldReplaceDurableChatSummary(existingSummary, nextSummary)) {
          await transactionalRepository.upsertChatSummary(nextSummary);
        }

        return endedLiveSession;
      }),
    );
  }

  private async run<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    try {
      return await operation();
    } catch (error) {
      this.rethrowChatMemoryError(error);
    }
  }

  private rethrowChatMemoryError(error: unknown): never {
    if (error instanceof ChatMemoryNotFoundError) {
      throw new NotFoundException(error.message);
    }

    if (error instanceof ChatMemoryInputError) {
      throw new BadRequestException(error.message);
    }

    throw error;
  }
}
