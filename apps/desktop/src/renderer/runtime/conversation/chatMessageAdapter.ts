import type { ChatMessageRecord } from '@livepair/shared-types';
import type { ConversationTurnModel } from './conversation.types';
import { formatConversationTimestamp } from './conversationTimestamp';

function sortChatMessageRecords(
  records: readonly ChatMessageRecord[],
): ChatMessageRecord[] {
  return [...records].sort((left, right) => left.sequence - right.sequence);
}

export function mapChatMessageRecordToConversationTurn(
  record: ChatMessageRecord,
): ConversationTurnModel {
  return {
    id: `persisted-message-${record.id}`,
    role: record.role,
    content: record.contentText,
    timestamp: formatConversationTimestamp(new Date(record.createdAt)),
    state: 'complete',
    persistedMessageId: record.id,
  };
}

export function mapChatMessageRecordsToConversationTurns(
  records: readonly ChatMessageRecord[],
): ConversationTurnModel[] {
  return sortChatMessageRecords(records).map((record) =>
    mapChatMessageRecordToConversationTurn(record),
  );
}
