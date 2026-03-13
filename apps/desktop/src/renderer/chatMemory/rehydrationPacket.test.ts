import { describe, expect, it } from 'vitest';
import type { ChatMessageRecord } from '@livepair/shared-types';
import {
  buildRehydrationPacket,
  DEFAULT_REHYDRATION_STABLE_INSTRUCTION,
  MAX_REHYDRATION_RECENT_TURNS,
} from './rehydrationPacket';
import { mapRehydrationPacketToLiveSessionHistory } from './currentChatMemory';
import {
  MAX_SCREEN_CONTEXT_SUMMARY_LENGTH,
  SCREEN_CONTEXT_SUMMARY_KEY,
} from './screenContextState';

describe('rehydrationPacket', () => {
  it('builds a deterministic compact packet from canonical persisted messages', () => {
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

  it('keeps only the last recent turns in deterministic canonical order', () => {
    const messages = Array.from({ length: MAX_REHYDRATION_RECENT_TURNS + 2 }, (_, index) => {
      const sequence = index + 1;

      return {
        id: `message-${sequence}`,
        chatId: 'chat-1',
        role: sequence % 2 === 0 ? 'assistant' : 'user',
        contentText: `Turn ${sequence}`,
        createdAt: `2026-03-12T09:${String(sequence).padStart(2, '0')}:00.000Z`,
        sequence,
      } satisfies ChatMessageRecord;
    });

    expect(buildRehydrationPacket(messages).recentTurns).toEqual([
      {
        role: 'user',
        kind: 'message',
        text: 'Turn 3',
        createdAt: '2026-03-12T09:03:00.000Z',
        sequence: 3,
      },
      {
        role: 'assistant',
        kind: 'message',
        text: 'Turn 4',
        createdAt: '2026-03-12T09:04:00.000Z',
        sequence: 4,
      },
      {
        role: 'user',
        kind: 'message',
        text: 'Turn 5',
        createdAt: '2026-03-12T09:05:00.000Z',
        sequence: 5,
      },
      {
        role: 'assistant',
        kind: 'message',
        text: 'Turn 6',
        createdAt: '2026-03-12T09:06:00.000Z',
        sequence: 6,
      },
      {
        role: 'user',
        kind: 'message',
        text: 'Turn 7',
        createdAt: '2026-03-12T09:07:00.000Z',
        sequence: 7,
      },
      {
        role: 'assistant',
        kind: 'message',
        text: 'Turn 8',
        createdAt: '2026-03-12T09:08:00.000Z',
        sequence: 8,
      },
    ]);
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

  it('uses persisted summary and context snapshots when they are available', () => {
    const packet = buildRehydrationPacket(
      [
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
      ],
      {
        summary: 'Persisted summary snapshot',
        contextState: {
          task: {
            entries: [{ key: 'taskStatus', value: 'active' }],
          },
          context: {
            entries: [{ key: 'repo', value: 'Livepair' }],
          },
        },
      },
    );

    expect(packet.summary).toBe('Persisted summary snapshot');
    expect(packet.contextState).toEqual({
      task: {
        entries: [{ key: 'taskStatus', value: 'active' }],
      },
      context: {
        entries: [{ key: 'repo', value: 'Livepair' }],
      },
    });
    expect(packet.recentTurns).toEqual([
      {
        role: 'user',
        kind: 'message',
        text: 'Persisted question',
        createdAt: '2026-03-12T09:01:00.000Z',
        sequence: 1,
      },
      {
        role: 'assistant',
        kind: 'message',
        text: 'Persisted answer',
        createdAt: '2026-03-12T09:02:00.000Z',
        sequence: 2,
      },
    ]);
  });

  it('replays only the unsummarized recent tail when summary coverage is available', () => {
    const packet = buildRehydrationPacket(
      [
        {
          id: 'message-1',
          chatId: 'chat-1',
          role: 'user',
          contentText: 'Turn 1',
          createdAt: '2026-03-12T09:01:00.000Z',
          sequence: 1,
        },
        {
          id: 'message-2',
          chatId: 'chat-1',
          role: 'assistant',
          contentText: 'Turn 2',
          createdAt: '2026-03-12T09:02:00.000Z',
          sequence: 2,
        },
        {
          id: 'message-3',
          chatId: 'chat-1',
          role: 'user',
          contentText: 'Turn 3',
          createdAt: '2026-03-12T09:03:00.000Z',
          sequence: 3,
        },
        {
          id: 'message-4',
          chatId: 'chat-1',
          role: 'assistant',
          contentText: 'Turn 4',
          createdAt: '2026-03-12T09:04:00.000Z',
          sequence: 4,
        },
      ],
      {
        summary: 'Persisted chat summary',
        summaryCoveredThroughSequence: 2,
      },
    );

    expect(packet.summary).toBe('Persisted chat summary');
    expect(packet.recentTurns).toEqual([
      {
        role: 'user',
        kind: 'message',
        text: 'Turn 3',
        createdAt: '2026-03-12T09:03:00.000Z',
        sequence: 3,
      },
      {
        role: 'assistant',
        kind: 'message',
        text: 'Turn 4',
        createdAt: '2026-03-12T09:04:00.000Z',
        sequence: 4,
      },
    ]);
  });

  it('keeps a short boundary anchor plus the newest unsummarized turns when the post-summary tail is long', () => {
    const messages = Array.from({ length: 10 }, (_, index) => {
      const sequence = index + 1;

      return {
        id: `message-${sequence}`,
        chatId: 'chat-1',
        role: sequence % 2 === 0 ? 'assistant' : 'user',
        contentText: `Turn ${sequence}`,
        createdAt: `2026-03-12T09:${String(sequence).padStart(2, '0')}:00.000Z`,
        sequence,
      } satisfies ChatMessageRecord;
    });

    expect(
      buildRehydrationPacket(messages, {
        summary: 'Persisted chat summary',
        summaryCoveredThroughSequence: 2,
      }).recentTurns,
    ).toEqual([
      {
        role: 'user',
        kind: 'message',
        text: 'Turn 3',
        createdAt: '2026-03-12T09:03:00.000Z',
        sequence: 3,
      },
      {
        role: 'assistant',
        kind: 'message',
        text: 'Turn 4',
        createdAt: '2026-03-12T09:04:00.000Z',
        sequence: 4,
      },
      {
        role: 'user',
        kind: 'message',
        text: 'Turn 7',
        createdAt: '2026-03-12T09:07:00.000Z',
        sequence: 7,
      },
      {
        role: 'assistant',
        kind: 'message',
        text: 'Turn 8',
        createdAt: '2026-03-12T09:08:00.000Z',
        sequence: 8,
      },
      {
        role: 'user',
        kind: 'message',
        text: 'Turn 9',
        createdAt: '2026-03-12T09:09:00.000Z',
        sequence: 9,
      },
      {
        role: 'assistant',
        kind: 'message',
        text: 'Turn 10',
        createdAt: '2026-03-12T09:10:00.000Z',
        sequence: 10,
      },
    ]);
  });

  it('keeps only a compact text-only screenContextSummary inside persisted context state', () => {
    const packet = buildRehydrationPacket(
      [
        {
          id: 'message-1',
          chatId: 'chat-1',
          role: 'user',
          contentText: 'Persisted question',
          createdAt: '2026-03-12T09:01:00.000Z',
          sequence: 1,
        },
      ],
      {
        contextState: {
          task: {
            entries: [],
          },
          context: {
            entries: [
              { key: 'repo', value: 'Livepair' },
              {
                key: SCREEN_CONTEXT_SUMMARY_KEY,
                value: `  ${'Dense IDE screen with failing tests and two edited files.'.repeat(20)}  `,
              },
            ],
          },
        },
      },
    );

    expect(packet.contextState).toEqual({
      task: {
        entries: [],
      },
      context: {
        entries: [
          { key: 'repo', value: 'Livepair' },
          {
            key: SCREEN_CONTEXT_SUMMARY_KEY,
            value: 'Dense IDE screen with failing tests and two edited files.'
              .repeat(20)
              .slice(0, MAX_SCREEN_CONTEXT_SUMMARY_LENGTH),
          },
        ],
      },
    });
  });

  it('drops empty persisted screenContextSummary entries instead of storing blank screen state', () => {
    const packet = buildRehydrationPacket(
      [],
      {
        contextState: {
          task: {
            entries: [],
          },
          context: {
            entries: [
              { key: 'repo', value: 'Livepair' },
              { key: SCREEN_CONTEXT_SUMMARY_KEY, value: '   ' },
            ],
          },
        },
      },
    );

    expect(packet.contextState).toEqual({
      task: {
        entries: [],
      },
      context: {
        entries: [{ key: 'repo', value: 'Livepair' }],
      },
    });
  });

  it('compacts task and context state to the latest explicit entries plus sanitized screen summary', () => {
    const packet = buildRehydrationPacket([], {
      contextState: {
        task: {
          entries: [
            { key: 'taskStatus', value: 'active' },
            { key: 'goal', value: 'Ship summary-first restore' },
            { key: 'taskStatus', value: 'reviewing' },
            { key: 'owner', value: 'copilot' },
            { key: 'milestone', value: 'wave-3' },
            { key: 'extra', value: '   ' },
          ],
        },
        context: {
          entries: [
            { key: 'repo', value: 'Livepair' },
            { key: 'branch', value: 'main' },
            { key: 'repo', value: 'Livepair/main' },
            { key: 'file', value: 'rehydrationPacket.ts' },
            { key: 'mode', value: 'speech' },
            { key: 'unused', value: '   ' },
            {
              key: SCREEN_CONTEXT_SUMMARY_KEY,
              value: `  ${'Dense IDE screen with failing tests and two edited files.'.repeat(20)}  `,
            },
          ],
        },
      },
    });

    expect(packet.contextState).toEqual({
      task: {
        entries: [
          { key: 'goal', value: 'Ship summary-first restore' },
          { key: 'taskStatus', value: 'reviewing' },
          { key: 'owner', value: 'copilot' },
          { key: 'milestone', value: 'wave-3' },
        ],
      },
      context: {
        entries: [
          { key: 'branch', value: 'main' },
          { key: 'repo', value: 'Livepair/main' },
          { key: 'file', value: 'rehydrationPacket.ts' },
          { key: 'mode', value: 'speech' },
          {
            key: SCREEN_CONTEXT_SUMMARY_KEY,
            value: 'Dense IDE screen with failing tests and two edited files.'
              .repeat(20)
              .slice(0, MAX_SCREEN_CONTEXT_SUMMARY_LENGTH),
          },
        ],
      },
    });
  });
});
