import { beforeEach, describe, expect, it, vi } from 'vitest';
import { switchToChat, resetCurrentChatMemoryForTests } from './currentChatMemory';
import { useSessionStore } from '../store/sessionStore';

describe('switchToChat', () => {
  beforeEach(() => {
    resetCurrentChatMemoryForTests();
    useSessionStore.getState().reset();
  });

  it('loads the target chat and replaces conversation turns', async () => {
    const bridge = {
      appendChatMessage: vi.fn(),
      getChat: vi.fn().mockResolvedValue({
        id: 'chat-2',
        title: 'Second chat',
        createdAt: '2026-03-10T00:00:00.000Z',
        updatedAt: '2026-03-11T00:00:00.000Z',
        isCurrent: false,
      }),
      getOrCreateCurrentChat: vi.fn(),
      listChatMessages: vi.fn().mockResolvedValue([
        {
          id: 'message-10',
          chatId: 'chat-2',
          role: 'user',
          contentText: 'Hello from the past',
          createdAt: '2026-03-10T09:00:00.000Z',
          sequence: 1,
        },
        {
          id: 'message-11',
          chatId: 'chat-2',
          role: 'assistant',
          contentText: 'Hi there',
          createdAt: '2026-03-10T09:00:05.000Z',
          sequence: 2,
        },
      ]),
      listLiveSessions: vi.fn(),
    };

    await switchToChat('chat-2', bridge as never);

    const state = useSessionStore.getState();
    expect(state.activeChatId).toBe('chat-2');
    expect(state.conversationTurns).toHaveLength(2);
    expect(state.conversationTurns[0]?.role).toBe('user');
    expect(state.conversationTurns[0]?.content).toBe('Hello from the past');
    expect(state.conversationTurns[1]?.role).toBe('assistant');
    expect(bridge.getChat).toHaveBeenCalledWith('chat-2');
    expect(bridge.listChatMessages).toHaveBeenCalledWith('chat-2');
  });

  it('throws when the target chat does not exist', async () => {
    const bridge = {
      appendChatMessage: vi.fn(),
      getChat: vi.fn().mockResolvedValue(null),
      getOrCreateCurrentChat: vi.fn(),
      listChatMessages: vi.fn(),
      listLiveSessions: vi.fn(),
    };

    await expect(switchToChat('missing-chat', bridge as never)).rejects.toThrow(
      'Chat not found: missing-chat',
    );
  });

  it('resets live session runtime state when switching chats', async () => {
    const bridge = {
      appendChatMessage: vi.fn(),
      getChat: vi.fn().mockResolvedValue({
        id: 'chat-3',
        title: null,
        createdAt: '2026-03-12T00:00:00.000Z',
        updatedAt: '2026-03-12T00:00:00.000Z',
        isCurrent: false,
      }),
      getOrCreateCurrentChat: vi.fn(),
      listChatMessages: vi.fn().mockResolvedValue([]),
      listLiveSessions: vi.fn(),
    };

    // Simulate a non-idle session state before switching.
    useSessionStore.getState().setVoiceSessionStatus('connecting');

    await switchToChat('chat-3', bridge as never);

    // After switching, session runtime should be reset to defaults.
    expect(useSessionStore.getState().voiceSessionStatus).toBe('disconnected');
    expect(useSessionStore.getState().activeChatId).toBe('chat-3');
  });
});
