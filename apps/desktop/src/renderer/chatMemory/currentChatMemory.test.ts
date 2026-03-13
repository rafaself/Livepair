import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRehydrationPacketFromCurrentChat, resetCurrentChatMemoryForTests } from './currentChatMemory';

describe('currentChatMemory rehydration packet sourcing', () => {
  beforeEach(() => {
    resetCurrentChatMemoryForTests();
  });

  it('uses the latest persisted live-session summary and context snapshot when available', async () => {
    const bridge = {
      appendChatMessage: vi.fn(),
      getOrCreateCurrentChat: vi.fn().mockResolvedValue({ id: 'chat-1' }),
      listChatMessages: vi.fn().mockResolvedValue([
        {
          id: 'message-1',
          chatId: 'chat-1',
          role: 'user',
          contentText: 'Persisted question',
          createdAt: '2026-03-12T09:01:00.000Z',
          sequence: 1,
        },
      ]),
      listLiveSessions: vi.fn().mockResolvedValue([
        {
          id: 'live-session-2',
          chatId: 'chat-1',
          startedAt: '2026-03-12T09:30:00.000Z',
          endedAt: null,
          status: 'active',
          endedReason: null,
          resumptionHandle: null,
          lastResumptionUpdateAt: null,
          restorable: false,
          invalidatedAt: null,
          invalidationReason: null,
          summarySnapshot: 'Persisted summary snapshot',
          contextStateSnapshot: {
            task: {
              entries: [{ key: 'taskStatus', value: 'active' }],
            },
            context: {
              entries: [{ key: 'repo', value: 'Livepair' }],
            },
          },
        },
      ]),
    };

    await expect(buildRehydrationPacketFromCurrentChat(bridge as never)).resolves.toEqual({
      stableInstruction:
        'Rehydrate this new Live session from the provided saved chat memory only. Prefer the summary and state when present, and use the recent turns as compact fallback context.',
      summary: 'Persisted summary snapshot',
      recentTurns: [
        {
          role: 'user',
          kind: 'message',
          text: 'Persisted question',
          createdAt: '2026-03-12T09:01:00.000Z',
          sequence: 1,
        },
      ],
      contextState: {
        task: {
          entries: [{ key: 'taskStatus', value: 'active' }],
        },
        context: {
          entries: [{ key: 'repo', value: 'Livepair' }],
        },
      },
    });
    expect(bridge.listLiveSessions).toHaveBeenCalledWith('chat-1');
  });
});
