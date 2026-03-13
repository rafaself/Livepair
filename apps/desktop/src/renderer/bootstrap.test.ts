import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '../shared/settings';
import { createDesktopSessionController } from './runtime/sessionController';
import { resetCurrentChatMemoryForTests } from './chatMemory/currentChatMemory';
import { createTextChatHarness, createUnusedTransport } from './runtime/sessionController.testUtils';
import { bootstrapDesktopRenderer } from './bootstrap';
import { resetDesktopStores } from './store/testing';
import { useSettingsStore } from './store/settingsStore';
import { useSessionStore } from './store/sessionStore';
import { useUiStore } from './store/uiStore';

describe('bootstrapDesktopRenderer', () => {
  beforeEach(() => {
    resetDesktopStores();
    resetCurrentChatMemoryForTests();
    document.documentElement.dataset['theme'] = '';
    document.documentElement.style.colorScheme = '';
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        media: '(prefers-color-scheme: dark)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    window.bridge.getSettings = vi.fn().mockResolvedValue(DEFAULT_DESKTOP_SETTINGS);
    window.bridge.updateSettings = vi.fn().mockResolvedValue(DEFAULT_DESKTOP_SETTINGS);
    window.bridge.getOrCreateCurrentChat = vi.fn().mockResolvedValue({
      id: 'chat-1',
      title: null,
      createdAt: '2026-03-12T09:00:00.000Z',
      updatedAt: '2026-03-12T09:00:00.000Z',
      isCurrent: true,
    });
    window.bridge.listChatMessages = vi.fn().mockResolvedValue([]);
  });

  it('hydrates settings before render, applies the resolved theme, and seeds drafts from persisted settings', async () => {
    await bootstrapDesktopRenderer();

    expect(window.bridge.getSettings).toHaveBeenCalledTimes(1);
    expect(window.bridge.getOrCreateCurrentChat).toHaveBeenCalledTimes(1);
    expect(window.bridge.listChatMessages).toHaveBeenCalledWith('chat-1');
    expect(useSettingsStore.getState().isReady).toBe(true);
    expect(useSessionStore.getState().activeChatId).toBe('chat-1');
    expect(useUiStore.getState().backendUrlDraft).toBe(DEFAULT_DESKTOP_SETTINGS.backendUrl);
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('hydrates persisted messages into the visible conversation model on startup', async () => {
    window.bridge.listChatMessages = vi.fn().mockResolvedValue([
      {
        id: 'message-2',
        chatId: 'chat-1',
        role: 'assistant',
        contentText: 'Stored answer',
        createdAt: '2026-03-12T09:02:00.000Z',
        sequence: 2,
      },
      {
        id: 'message-1',
        chatId: 'chat-1',
        role: 'user',
        contentText: 'Stored prompt',
        createdAt: '2026-03-12T09:01:00.000Z',
        sequence: 1,
      },
    ]);

    await bootstrapDesktopRenderer();

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'persisted-message-message-1',
        role: 'user',
        content: 'Stored prompt',
        state: 'complete',
        persistedMessageId: 'message-1',
      }),
      expect.objectContaining({
        id: 'persisted-message-message-2',
        role: 'assistant',
        content: 'Stored answer',
        state: 'complete',
        persistedMessageId: 'message-2',
      }),
    ]);
  });

  it('restores the same current conversation after a restart from persisted chat memory', async () => {
    const textChat = createTextChatHarness();
    const chat = {
      id: 'chat-9',
      title: null,
      createdAt: '2026-03-12T09:00:00.000Z',
      updatedAt: '2026-03-12T09:00:00.000Z',
      isCurrent: true,
    };
    const persistedMessages: Array<{
      id: string;
      chatId: string;
      role: 'user' | 'assistant';
      contentText: string;
      createdAt: string;
      sequence: number;
    }> = [];

    window.bridge.getOrCreateCurrentChat = vi.fn().mockResolvedValue(chat);
    window.bridge.listChatMessages = vi.fn().mockImplementation(async () => [...persistedMessages]);
    window.bridge.appendChatMessage = vi.fn().mockImplementation(
      async ({ role, contentText }: { role: 'user' | 'assistant'; contentText: string }) => {
        const nextRecord = {
          id: `message-${persistedMessages.length + 1}`,
          chatId: chat.id,
          role,
          contentText,
          createdAt: `2026-03-12T09:0${persistedMessages.length + 1}:00.000Z`,
          sequence: persistedMessages.length + 1,
        };
        persistedMessages.push(nextRecord);
        return nextRecord;
      },
    );

    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      startTextChatStream: textChat.startTextChatStream,
      requestSessionToken: vi.fn(),
      createTransport: vi.fn(() => createUnusedTransport()),
    });

    await controller.submitTextTurn('Persist this conversation');
    textChat.emit({ type: 'text-delta', text: 'Restored after restart' });
    textChat.emit({ type: 'completed' });

    await vi.waitFor(() => {
      expect(persistedMessages).toEqual([
        expect.objectContaining({
          role: 'user',
          contentText: 'Persist this conversation',
          sequence: 1,
        }),
        expect.objectContaining({
          role: 'assistant',
          contentText: 'Restored after restart',
          sequence: 2,
        }),
      ]);
    });

    resetDesktopStores();
    resetCurrentChatMemoryForTests();

    await bootstrapDesktopRenderer();

    expect(useSessionStore.getState().activeChatId).toBe(chat.id);
    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Persist this conversation',
        persistedMessageId: 'message-1',
      }),
      expect.objectContaining({
        role: 'assistant',
        content: 'Restored after restart',
        persistedMessageId: 'message-2',
      }),
    ]);
  });
});
