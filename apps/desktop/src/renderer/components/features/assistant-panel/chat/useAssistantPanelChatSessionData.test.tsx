import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatRecord, LiveSessionRecord } from '@livepair/shared-types';
import { getChatRecord } from '../../../../chatMemory';
import { getLatestPersistedLiveSession } from '../../../../liveSessions';
import { useAssistantPanelChatSessionData } from './useAssistantPanelChatSessionData';

vi.mock('../../../../chatMemory', () => ({
  getChatRecord: vi.fn(),
}));

vi.mock('../../../../liveSessions', () => ({
  getLatestPersistedLiveSession: vi.fn(),
}));

function createChatRecord(id: string): ChatRecord {
  return {
    id,
    title: `Chat ${id}`,
    createdAt: '2026-03-14T10:00:00.000Z',
    updatedAt: '2026-03-14T10:30:00.000Z',
    isCurrent: id === 'chat-current',
  };
}

function createLiveSessionRecord(chatId: string): LiveSessionRecord {
  return {
    id: `live-${chatId}`,
    chatId,
    startedAt: '2026-03-14T10:05:00.000Z',
    endedAt: null,
    status: 'active',
    endedReason: null,
    resumptionHandle: `handles/${chatId}`,
    lastResumptionUpdateAt: '2026-03-14T10:10:00.000Z',
    restorable: true,
    invalidatedAt: null,
    invalidationReason: null,
  };
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

describe('useAssistantPanelChatSessionData', () => {
  const mockGetChatRecord = vi.mocked(getChatRecord);
  const mockGetLatestPersistedLiveSession = vi.mocked(getLatestPersistedLiveSession);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the active chat and latest live session for the selected chat id', async () => {
    mockGetChatRecord.mockResolvedValue(createChatRecord('chat-1'));
    mockGetLatestPersistedLiveSession.mockResolvedValue(createLiveSessionRecord('chat-1'));

    const { result } = renderHook(() =>
      useAssistantPanelChatSessionData({
        activeChatId: 'chat-1',
      }),
    );

    await waitFor(() => {
      expect(result.current.activeChat).toEqual(createChatRecord('chat-1'));
      expect(result.current.latestLiveSession).toEqual(createLiveSessionRecord('chat-1'));
    });

    expect(mockGetChatRecord).toHaveBeenCalledWith('chat-1');
    expect(mockGetLatestPersistedLiveSession).toHaveBeenCalledWith('chat-1');
  });

  it('ignores stale async results and clears the chat session data when chat selection resets', async () => {
    const firstChat = createDeferred<ChatRecord | null>();
    const firstLiveSession = createDeferred<LiveSessionRecord | null>();

    mockGetChatRecord.mockImplementation(async (chatId: string) => {
      if (chatId === 'chat-1') {
        return firstChat.promise;
      }

      return createChatRecord(chatId);
    });
    mockGetLatestPersistedLiveSession.mockImplementation(async (chatId: string) => {
      if (chatId === 'chat-1') {
        return firstLiveSession.promise;
      }

      return createLiveSessionRecord(chatId);
    });

    const { result, rerender } = renderHook(
      ({ activeChatId }: { activeChatId: string | null }) =>
        useAssistantPanelChatSessionData({
          activeChatId,
        }),
      {
        initialProps: {
          activeChatId: 'chat-1' as string | null,
        },
      },
    );

    rerender({ activeChatId: 'chat-2' });

    await waitFor(() => {
      expect(result.current.activeChat).toEqual(createChatRecord('chat-2'));
      expect(result.current.latestLiveSession).toEqual(createLiveSessionRecord('chat-2'));
    });

    firstChat.resolve(createChatRecord('chat-1'));
    firstLiveSession.resolve(createLiveSessionRecord('chat-1'));

    await waitFor(() => {
      expect(result.current.activeChat).toEqual(createChatRecord('chat-2'));
      expect(result.current.latestLiveSession).toEqual(createLiveSessionRecord('chat-2'));
    });

    rerender({ activeChatId: null });

    await waitFor(() => {
      expect(result.current.activeChat).toBeNull();
      expect(result.current.latestLiveSession).toBeNull();
    });
  });
});
