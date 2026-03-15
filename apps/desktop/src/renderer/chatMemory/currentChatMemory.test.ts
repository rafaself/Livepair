import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatId } from '@livepair/shared-types';
import {
  buildRehydrationPacketFromCurrentChat,
  resetCurrentChatMemoryForTests,
  switchToChat,
} from './currentChatMemory';
import { useSessionStore } from '../store/sessionStore';
import {
  MAX_SCREEN_CONTEXT_SUMMARY_LENGTH,
  SCREEN_CONTEXT_SUMMARY_KEY,
} from './screenContextState';

const OVERLAY_DISPLAY = {
  displayId: '1',
  bounds: { x: 0, y: 0, width: 2560, height: 1440 },
  workArea: { x: 0, y: 23, width: 2560, height: 1417 },
  scaleFactor: 2,
} as const;

function createScreenSource(id: string, name: string, displayId: string) {
  return { id, name, kind: 'screen' as const, displayId };
}

function createWindowSource(id: string, name: string) {
  return { id, name, kind: 'window' as const };
}

describe('currentChatMemory rehydration packet sourcing', () => {
  beforeEach(() => {
    resetCurrentChatMemoryForTests();
  });

  it('prefers the persisted chat summary and keeps a boundary anchor plus the newest unsummarized turns', async () => {
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
        {
          id: 'message-2',
          chatId: 'chat-1',
          role: 'assistant',
          contentText: 'Persisted answer',
          createdAt: '2026-03-12T09:02:00.000Z',
          sequence: 2,
        },
        {
          id: 'message-3',
          chatId: 'chat-1',
          role: 'user',
          contentText: 'Unsummarized follow-up',
          createdAt: '2026-03-12T09:03:00.000Z',
          sequence: 3,
        },
        {
          id: 'message-4',
          chatId: 'chat-1',
          role: 'assistant',
          contentText: 'Unsummarized reply',
          createdAt: '2026-03-12T09:04:00.000Z',
          sequence: 4,
        },
        {
          id: 'message-5',
          chatId: 'chat-1',
          role: 'user',
          contentText: 'Recent turn 5',
          createdAt: '2026-03-12T09:05:00.000Z',
          sequence: 5,
        },
        {
          id: 'message-6',
          chatId: 'chat-1',
          role: 'assistant',
          contentText: 'Recent turn 6',
          createdAt: '2026-03-12T09:06:00.000Z',
          sequence: 6,
        },
        {
          id: 'message-7',
          chatId: 'chat-1',
          role: 'user',
          contentText: 'Recent turn 7',
          createdAt: '2026-03-12T09:07:00.000Z',
          sequence: 7,
        },
        {
          id: 'message-8',
          chatId: 'chat-1',
          role: 'assistant',
          contentText: 'Recent turn 8',
          createdAt: '2026-03-12T09:08:00.000Z',
          sequence: 8,
        },
      ]),
      getChatSummary: vi.fn().mockResolvedValue({
        chatId: 'chat-1',
        schemaVersion: 1,
        source: 'local-recent-history-v1',
        summaryText: 'Compact continuity summary',
        coveredThroughSequence: 2,
        updatedAt: '2026-03-12T09:02:30.000Z',
      }),
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
          summarySnapshot: 'Older live-session snapshot',
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
      summary: 'Compact continuity summary',
      recentTurns: [
        {
          role: 'user',
          kind: 'message',
          text: 'Unsummarized follow-up',
          createdAt: '2026-03-12T09:03:00.000Z',
          sequence: 3,
        },
        {
          role: 'assistant',
          kind: 'message',
          text: 'Unsummarized reply',
          createdAt: '2026-03-12T09:04:00.000Z',
          sequence: 4,
        },
        {
          role: 'user',
          kind: 'message',
          text: 'Recent turn 5',
          createdAt: '2026-03-12T09:05:00.000Z',
          sequence: 5,
        },
        {
          role: 'assistant',
          kind: 'message',
          text: 'Recent turn 6',
          createdAt: '2026-03-12T09:06:00.000Z',
          sequence: 6,
        },
        {
          role: 'user',
          kind: 'message',
          text: 'Recent turn 7',
          createdAt: '2026-03-12T09:07:00.000Z',
          sequence: 7,
        },
        {
          role: 'assistant',
          kind: 'message',
          text: 'Recent turn 8',
          createdAt: '2026-03-12T09:08:00.000Z',
          sequence: 8,
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
    expect(bridge.getChatSummary).toHaveBeenCalledWith('chat-1');
    expect(bridge.listLiveSessions).toHaveBeenCalledWith('chat-1');
  });

  it('falls back from a stale chat summary to the live-session snapshot summary when coverage exceeds canonical history', async () => {
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
        {
          id: 'message-2',
          chatId: 'chat-1',
          role: 'assistant',
          contentText: 'Persisted answer',
          createdAt: '2026-03-12T09:02:00.000Z',
          sequence: 2,
        },
      ]),
      getChatSummary: vi.fn().mockResolvedValue({
        chatId: 'chat-1',
        schemaVersion: 1,
        source: 'local-recent-history-v1',
        summaryText: 'Stale chat summary',
        coveredThroughSequence: 99,
        updatedAt: '2026-03-12T09:02:30.000Z',
      }),
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
          summarySnapshot: 'Fallback live-session summary',
          contextStateSnapshot: null,
        },
      ]),
    };

    await expect(buildRehydrationPacketFromCurrentChat(bridge as never)).resolves.toEqual({
      stableInstruction:
        'Rehydrate this new Live session from the provided saved chat memory only. Prefer the summary and state when present, and use the recent turns as compact fallback context.',
      summary: 'Fallback live-session summary',
      recentTurns: [
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

  it('falls back to the latest persisted live-session summary and context snapshot when no chat summary exists', async () => {
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
      getChatSummary: vi.fn().mockResolvedValue(null),
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
  });

  it('sanitizes persisted screenContextSummary from the latest live-session snapshot for rehydration', async () => {
    const bridge = {
      appendChatMessage: vi.fn(),
      getOrCreateCurrentChat: vi.fn().mockResolvedValue({ id: 'chat-1' }),
      listChatMessages: vi.fn().mockResolvedValue([]),
      getChatSummary: vi.fn().mockResolvedValue(null),
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
          summarySnapshot: null,
          contextStateSnapshot: {
            task: {
              entries: [],
            },
            context: {
              entries: [
                { key: 'repo', value: 'Livepair' },
                {
                  key: SCREEN_CONTEXT_SUMMARY_KEY,
                  value: `  ${'IDE shows a failing test and the active diff for screen-share recovery.'.repeat(20)}  `,
                },
              ],
            },
          },
        },
      ]),
    };

    await expect(buildRehydrationPacketFromCurrentChat(bridge as never)).resolves.toEqual({
      stableInstruction:
        'Rehydrate this new Live session from the provided saved chat memory only. Prefer the summary and state when present, and use the recent turns as compact fallback context.',
      summary: null,
      recentTurns: [],
      contextState: {
        task: {
          entries: [],
        },
        context: {
          entries: [
            { key: 'repo', value: 'Livepair' },
            {
              key: SCREEN_CONTEXT_SUMMARY_KEY,
              value: 'IDE shows a failing test and the active diff for screen-share recovery.'
                .repeat(20)
                .slice(0, MAX_SCREEN_CONTEXT_SUMMARY_LENGTH),
            },
          ],
        },
      },
    });
  });

  it('keeps the persisted summary but ignores a stale coverage boundary for very long chats', async () => {
    const messages = Array.from({ length: 40 }, (_, index) => {
      const sequence = index + 1;

      return {
        id: `message-${sequence}`,
        chatId: 'chat-1',
        role: sequence % 2 === 0 ? 'assistant' : 'user',
        contentText: `Turn ${sequence}`,
        createdAt: `2026-03-12T09:${String((sequence - 1) % 60).padStart(2, '0')}:00.000Z`,
        sequence,
      };
    });

    const bridge = {
      appendChatMessage: vi.fn(),
      getOrCreateCurrentChat: vi.fn().mockResolvedValue({ id: 'chat-1' }),
      listChatMessages: vi.fn().mockResolvedValue(messages),
      getChatSummary: vi.fn().mockResolvedValue({
        chatId: 'chat-1',
        schemaVersion: 1,
        source: 'local-recent-history-v1',
        summaryText: 'Persisted long-chat summary',
        coveredThroughSequence: 10,
        updatedAt: '2026-03-12T09:10:30.000Z',
      }),
      listLiveSessions: vi.fn().mockResolvedValue([]),
    };

    await expect(buildRehydrationPacketFromCurrentChat(bridge as never)).resolves.toEqual({
      stableInstruction:
        'Rehydrate this new Live session from the provided saved chat memory only. Prefer the summary and state when present, and use the recent turns as compact fallback context.',
      summary: 'Persisted long-chat summary',
      recentTurns: [
        {
          role: 'user',
          kind: 'message',
          text: 'Turn 35',
          createdAt: '2026-03-12T09:34:00.000Z',
          sequence: 35,
        },
        {
          role: 'assistant',
          kind: 'message',
          text: 'Turn 36',
          createdAt: '2026-03-12T09:35:00.000Z',
          sequence: 36,
        },
        {
          role: 'user',
          kind: 'message',
          text: 'Turn 37',
          createdAt: '2026-03-12T09:36:00.000Z',
          sequence: 37,
        },
        {
          role: 'assistant',
          kind: 'message',
          text: 'Turn 38',
          createdAt: '2026-03-12T09:37:00.000Z',
          sequence: 38,
        },
        {
          role: 'user',
          kind: 'message',
          text: 'Turn 39',
          createdAt: '2026-03-12T09:38:00.000Z',
          sequence: 39,
        },
        {
          role: 'assistant',
          kind: 'message',
          text: 'Turn 40',
          createdAt: '2026-03-12T09:39:00.000Z',
          sequence: 40,
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
});

describe('wave 1: switchToChat screen-capture state preservation', () => {
  beforeEach(() => {
    resetCurrentChatMemoryForTests();
    useSessionStore.getState().reset();
  });

  it('preserves screenCaptureSources through the session reset on chat switch', async () => {
    const bridge = {
      getChat: vi.fn().mockResolvedValue({
        id: 'chat-2' as ChatId,
        title: null,
        createdAt: '2026-03-12T09:00:00.000Z',
        updatedAt: '2026-03-12T09:00:00.000Z',
        isCurrent: false,
      }),
      listChatMessages: vi.fn().mockResolvedValue([]),
    };

    useSessionStore.getState().setScreenCaptureSourceSnapshot({
      sources: [
        createScreenSource('screen:1:0', 'Entire Screen', '1'),
        createWindowSource('window:42:0', 'VSCode'),
      ],
      selectedSourceId: 'screen:1:0',
      overlayDisplay: OVERLAY_DISPLAY,
    });

    await switchToChat('chat-2' as ChatId, bridge as never);

    expect(useSessionStore.getState().screenCaptureSources).toEqual([
      createScreenSource('screen:1:0', 'Entire Screen', '1'),
      createWindowSource('window:42:0', 'VSCode'),
    ]);
  });

  it('preserves selectedScreenCaptureSourceId through the session reset on chat switch', async () => {
    const bridge = {
      getChat: vi.fn().mockResolvedValue({
        id: 'chat-2' as ChatId,
        title: null,
        createdAt: '2026-03-12T09:00:00.000Z',
        updatedAt: '2026-03-12T09:00:00.000Z',
        isCurrent: false,
      }),
      listChatMessages: vi.fn().mockResolvedValue([]),
    };

    useSessionStore.getState().setScreenCaptureSourceSnapshot({
      sources: [
        createScreenSource('screen:1:0', 'Entire Screen', '1'),
        createWindowSource('window:42:0', 'VSCode'),
      ],
      selectedSourceId: 'window:42:0',
      overlayDisplay: OVERLAY_DISPLAY,
    });

    await switchToChat('chat-2' as ChatId, bridge as never);

    expect(useSessionStore.getState().selectedScreenCaptureSourceId).toBe('window:42:0');
  });

  it('activeChatId is updated to the new chat after switchToChat', async () => {
    const bridge = {
      getChat: vi.fn().mockResolvedValue({
        id: 'chat-2' as ChatId,
        title: null,
        createdAt: '2026-03-12T09:00:00.000Z',
        updatedAt: '2026-03-12T09:00:00.000Z',
        isCurrent: false,
      }),
      listChatMessages: vi.fn().mockResolvedValue([]),
    };

    useSessionStore.getState().setScreenCaptureSourceSnapshot({
      sources: [createScreenSource('screen:1:0', 'Entire Screen', '1')],
      selectedSourceId: 'screen:1:0',
      overlayDisplay: OVERLAY_DISPLAY,
    });

    await switchToChat('chat-2' as ChatId, bridge as never);

    expect(useSessionStore.getState().activeChatId).toBe('chat-2');
    // Sources must still be available after the reset+activeChatId update
    expect(useSessionStore.getState().screenCaptureSources).toHaveLength(1);
  });
});
