import type { ChatId, ChatRecord, DurableChatSummaryRecord } from '@livepair/shared-types';
import type { ChatMemoryRepositoryStatements } from './chatMemoryRepositoryStatements';
import { toDurableChatSummaryRecord } from './rowMappers';
import type { ChatSummaryRow } from './rowMappers';

type ChatLookup = (chatId: ChatId) => ChatRecord | null;

export type ChatMemorySummaryStore = {
  getChatSummary: (chatId: ChatId) => DurableChatSummaryRecord | null;
  upsertChatSummary: (summary: DurableChatSummaryRecord) => DurableChatSummaryRecord;
};

export function createChatMemorySummaryStore({
  statements,
  getChat,
}: {
  statements: ChatMemoryRepositoryStatements;
  getChat: ChatLookup;
}): ChatMemorySummaryStore {
  const getChatSummary = (chatId: ChatId): DurableChatSummaryRecord | null => {
    const row = statements.selectChatSummaryByChatId.get(chatId) as ChatSummaryRow | undefined;
    return row ? toDurableChatSummaryRecord(row) : null;
  };

  const upsertChatSummary = (summary: DurableChatSummaryRecord): DurableChatSummaryRecord => {
    const existingChat = getChat(summary.chatId);

    if (!existingChat) {
      throw new Error(`Chat not found: ${summary.chatId}`);
    }

    statements.upsertChatSummary.run(summary);
    return summary;
  };

  return {
    getChatSummary,
    upsertChatSummary,
  };
}
