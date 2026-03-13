import { describe, expect, it, vi } from 'vitest';
import type { ChatMessageRecord } from '@livepair/shared-types';
import { useSessionStore } from '../../store/sessionStore';
import { persistConversationTurn } from './persistConversationTurn';

describe('persistConversationTurn', () => {
  it('persists a completed turn once and annotates it with the stored message id', async () => {
    useSessionStore.getState().appendConversationTurn({
      id: 'assistant-turn-1',
      role: 'assistant',
      content: 'Stored reply',
      timestamp: '9:00 AM',
      state: 'complete',
    });

    await persistConversationTurn(useSessionStore, 'assistant-turn-1');

    expect(window.bridge.appendChatMessage).toHaveBeenCalledWith({
      chatId: 'chat-1',
      role: 'assistant',
      contentText: 'Stored reply',
    });
    expect(useSessionStore.getState().conversationTurns[0]).toEqual(
      expect.objectContaining({
        persistedMessageId: 'assistant-message-1',
      }),
    );
  });

  it('does not persist failed turns into canonical history', async () => {
    useSessionStore.getState().appendConversationTurn({
      id: 'assistant-turn-1',
      role: 'assistant',
      content: 'Partial reply',
      timestamp: '9:00 AM',
      state: 'error',
      statusLabel: 'Response failed',
    });

    await persistConversationTurn(useSessionStore, 'assistant-turn-1');

    expect(window.bridge.appendChatMessage).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent persistence for the same turn', async () => {
    let resolveAppend: ((value: ChatMessageRecord) => void) | undefined;

    window.bridge.appendChatMessage = vi.fn(
      async () =>
        new Promise<ChatMessageRecord>((resolve) => {
          resolveAppend = resolve;
        }),
    ) as typeof window.bridge.appendChatMessage;

    useSessionStore.getState().appendConversationTurn({
      id: 'assistant-turn-1',
      role: 'assistant',
      content: 'Stored once',
      timestamp: '9:00 AM',
      state: 'complete',
    });

    const backgroundPersist = persistConversationTurn(useSessionStore, 'assistant-turn-1');
    const deduplicatedPersist = persistConversationTurn(useSessionStore, 'assistant-turn-1');

    await vi.waitFor(() => {
      expect(window.bridge.appendChatMessage).toHaveBeenCalledTimes(1);
    });

    const finishAppend = resolveAppend;
    finishAppend?.({
      id: 'assistant-message-1',
      chatId: 'chat-1',
      role: 'assistant',
      contentText: 'Stored once',
      createdAt: '2026-03-12T09:00:00.000Z',
      sequence: 1,
    });

    await vi.waitFor(() => {
      expect(useSessionStore.getState().conversationTurns[0]).toEqual(
        expect.objectContaining({
          persistedMessageId: 'assistant-message-1',
        }),
      );
    });

    await backgroundPersist;
    await deduplicatedPersist;
  });
});
