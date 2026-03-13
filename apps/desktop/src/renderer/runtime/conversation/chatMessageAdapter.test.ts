import { describe, expect, it } from 'vitest';
import type { ChatMessageRecord } from '@livepair/shared-types';
import { formatConversationTimestamp } from './conversationTimestamp';
import {
  mapChatMessageRecordToConversationTurn,
  mapChatMessageRecordsToConversationTurns,
  mapChatMessageRecordToTextChatMessage,
  mapChatMessageRecordsToTextChatMessages,
} from './chatMessageAdapter';

function createChatMessageRecord(
  overrides: Partial<ChatMessageRecord> = {},
): ChatMessageRecord {
  return {
    id: 'message-1',
    chatId: 'chat-1',
    role: 'assistant',
    contentText: 'Stored response',
    createdAt: '2026-03-12T10:15:00.000Z',
    sequence: 2,
    ...overrides,
  };
}

describe('chatMessageAdapter', () => {
  it('maps a persisted chat message into the visible conversation model explicitly', () => {
    const record = createChatMessageRecord({
      id: 'message-7',
      role: 'user',
      contentText: 'Stored prompt',
      createdAt: '2026-03-12T09:41:00.000Z',
    });

    expect(mapChatMessageRecordToConversationTurn(record)).toEqual({
      id: 'persisted-message-message-7',
      role: 'user',
      content: 'Stored prompt',
      timestamp: formatConversationTimestamp(new Date(record.createdAt)),
      state: 'complete',
      persistedMessageId: 'message-7',
    });
  });

  it('preserves deterministic ordering by sequence when projecting persisted history', () => {
    const turns = mapChatMessageRecordsToConversationTurns([
      createChatMessageRecord({
        id: 'message-2',
        role: 'assistant',
        contentText: 'Second reply',
        sequence: 2,
      }),
      createChatMessageRecord({
        id: 'message-1',
        role: 'user',
        contentText: 'First prompt',
        sequence: 1,
      }),
    ]);

    expect(turns).toEqual([
      expect.objectContaining({
        id: 'persisted-message-message-1',
        role: 'user',
        content: 'First prompt',
      }),
      expect.objectContaining({
        id: 'persisted-message-message-2',
        role: 'assistant',
        content: 'Second reply',
      }),
    ]);
  });

  it('maps a persisted chat message into an explicit Gemini text chat message', () => {
    const record = createChatMessageRecord({
      role: 'assistant',
      contentText: 'Stored response',
    });

    expect(mapChatMessageRecordToTextChatMessage(record)).toEqual({
      role: 'assistant',
      content: 'Stored response',
    });
  });

  it('preserves sequence ordering when building text request messages from persisted history', () => {
    const messages = mapChatMessageRecordsToTextChatMessages([
      createChatMessageRecord({
        id: 'message-2',
        role: 'assistant',
        contentText: 'Second reply',
        sequence: 2,
      }),
      createChatMessageRecord({
        id: 'message-1',
        role: 'user',
        contentText: 'First prompt',
        sequence: 1,
      }),
    ]);

    expect(messages).toEqual([
      { role: 'user', content: 'First prompt' },
      { role: 'assistant', content: 'Second reply' },
    ]);
  });
});
