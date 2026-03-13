import { describe, expect, it } from 'vitest';
import type { ChatMessageRecord } from '@livepair/shared-types';
import {
  buildRehydrationPacket,
  DEFAULT_REHYDRATION_STABLE_INSTRUCTION,
} from './rehydrationPacket';
import { mapRehydrationPacketToLiveSessionHistory } from './currentChatMemory';

describe('rehydrationPacket', () => {
  it('builds a deterministic packet from canonical persisted messages', () => {
    const messages: ChatMessageRecord[] = [
      {
        id: 'message-3',
        chatId: 'chat-1',
        role: 'assistant',
        contentText: 'Third answer',
        createdAt: '2026-03-12T09:03:00.000Z',
        sequence: 3,
      },
      {
        id: 'message-1',
        chatId: 'chat-1',
        role: 'user',
        contentText: 'First question',
        createdAt: '2026-03-12T09:01:00.000Z',
        sequence: 1,
      },
      {
        id: 'message-2',
        chatId: 'chat-1',
        role: 'assistant',
        contentText: 'Second answer',
        createdAt: '2026-03-12T09:02:00.000Z',
        sequence: 2,
      },
    ];

    expect(buildRehydrationPacket(messages)).toEqual({
      stableInstruction: DEFAULT_REHYDRATION_STABLE_INSTRUCTION,
      summary: null,
      recentTurns: [
        {
          role: 'user',
          kind: 'message',
          text: 'First question',
          createdAt: '2026-03-12T09:01:00.000Z',
          sequence: 1,
        },
        {
          role: 'assistant',
          kind: 'message',
          text: 'Second answer',
          createdAt: '2026-03-12T09:02:00.000Z',
          sequence: 2,
        },
        {
          role: 'assistant',
          kind: 'message',
          text: 'Third answer',
          createdAt: '2026-03-12T09:03:00.000Z',
          sequence: 3,
        },
      ],
      contextState: {
        task: {
          entries: [],
        },
        context: {
          entries: [],
        },
      },
    });
  });

  it('maps packet turns back to the existing Live session history transport shape', () => {
    const packet = buildRehydrationPacket([
      {
        id: 'message-1',
        chatId: 'chat-1',
        role: 'user',
        contentText: 'Persisted question',
        createdAt: '2026-03-12T09:01:00.000Z',
        sequence: 1,
      },
      {
        id: 'message-2',
        chatId: 'chat-1',
        role: 'assistant',
        contentText: 'Persisted answer',
        createdAt: '2026-03-12T09:02:00.000Z',
        sequence: 2,
      },
    ]);

    expect(mapRehydrationPacketToLiveSessionHistory(packet)).toEqual([
      {
        role: 'user',
        parts: [{ text: 'Persisted question' }],
      },
      {
        role: 'model',
        parts: [{ text: 'Persisted answer' }],
      },
    ]);
  });
});
