import type { ChatMessageRecord } from '@livepair/shared-types';
import {
  buildDurableChatSummary,
  DURABLE_CHAT_SUMMARY_SCHEMA_VERSION,
  DURABLE_CHAT_SUMMARY_SOURCE,
  shouldReplaceDurableChatSummary,
} from './chat-summary';

describe('chat-summary', () => {
  it('builds a compact durable summary record from canonical messages', () => {
    const messages: ChatMessageRecord[] = [
      {
        id: 'message-2',
        chatId: 'chat-1',
        role: 'assistant',
        contentText: 'We should update the restore flow next.',
        createdAt: '2026-03-12T09:02:00.000Z',
        sequence: 2,
      },
      {
        id: 'message-1',
        chatId: 'chat-1',
        role: 'user',
        contentText: 'Please keep the history intact while improving restore.',
        createdAt: '2026-03-12T09:01:00.000Z',
        sequence: 1,
      },
    ];

    expect(
      buildDurableChatSummary({
        chatId: 'chat-1',
        messages,
        updatedAt: '2026-03-12T09:05:00.000Z',
      }),
    ).toEqual({
      chatId: 'chat-1',
      schemaVersion: DURABLE_CHAT_SUMMARY_SCHEMA_VERSION,
      source: DURABLE_CHAT_SUMMARY_SOURCE,
      summaryText: expect.stringContaining(
        'User: Please keep the history intact while improving restore.',
      ),
      coveredThroughSequence: 2,
      updatedAt: '2026-03-12T09:05:00.000Z',
    });
  });

  it('returns null when there is no canonical history to summarize', () => {
    expect(
      buildDurableChatSummary({
        chatId: 'chat-1',
        messages: [],
        updatedAt: '2026-03-12T09:05:00.000Z',
      }),
    ).toBeNull();
  });

  it('replaces a durable summary only when the new summary covers later canonical history', () => {
    const existingSummary = {
      chatId: 'chat-1',
      schemaVersion: DURABLE_CHAT_SUMMARY_SCHEMA_VERSION,
      source: DURABLE_CHAT_SUMMARY_SOURCE,
      summaryText: 'Older summary',
      coveredThroughSequence: 4,
      updatedAt: '2026-03-12T09:05:00.000Z',
    } as const;

    expect(
      shouldReplaceDurableChatSummary(existingSummary, {
        ...existingSummary,
        summaryText: 'Newer summary',
        coveredThroughSequence: 5,
      }),
    ).toBe(true);
    expect(
      shouldReplaceDurableChatSummary(existingSummary, {
        ...existingSummary,
        summaryText: 'Same coverage summary',
      }),
    ).toBe(false);
  });
});
