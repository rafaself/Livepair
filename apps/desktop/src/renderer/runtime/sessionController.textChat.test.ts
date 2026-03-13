import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeLogger } from './core/session.types';
import { createDesktopSessionController } from './sessionController';
import { selectAssistantRuntimeState } from './selectors';
import { useSessionStore } from '../store/sessionStore';
import { useSettingsStore } from '../store/settingsStore';
import { DEFAULT_DESKTOP_SETTINGS } from '../../shared/settings';
import {
  createUnusedTransport,
  createTextChatHarness,
  createVoiceTransportHarness,
} from './sessionController.testUtils';
import { resetCurrentChatMemoryForTests } from '../chatMemory/currentChatMemory';

describe('createDesktopSessionController – text chat', () => {
  let persistedMessages: Array<{
    id: string;
    chatId: string;
    role: 'user' | 'assistant';
    contentText: string;
    createdAt: string;
    sequence: number;
  }>;

  beforeEach(() => {
    useSessionStore.getState().reset();
    useSettingsStore.setState({
      settings: DEFAULT_DESKTOP_SETTINGS,
      isReady: true,
    });
    resetCurrentChatMemoryForTests();
    persistedMessages = [];
    window.bridge.getOrCreateCurrentChat = vi.fn().mockResolvedValue({
      id: 'chat-1',
      title: null,
      createdAt: '2026-03-12T09:00:00.000Z',
      updatedAt: '2026-03-12T09:00:00.000Z',
      isCurrent: true,
    });
    window.bridge.listChatMessages = vi.fn().mockImplementation(async () => [...persistedMessages]);
    window.bridge.appendChatMessage = vi.fn().mockImplementation(
      async ({
        chatId,
        role,
        contentText,
      }: {
        chatId: string;
        role: 'user' | 'assistant';
        contentText: string;
      }) => {
        const nextRecord = {
          id: `${role}-message-${persistedMessages.length + 1}`,
          chatId,
          role,
          contentText,
          createdAt: `2026-03-12T09:0${persistedMessages.length + 1}:00.000Z`,
          sequence: persistedMessages.length + 1,
        };
        persistedMessages.push(nextRecord);
        return nextRecord;
      },
    );
  });

  it('auto-starts text mode, streams assistant text, and completes the turn', async () => {
    const textChat = createTextChatHarness();
    const requestSessionToken = vi.fn();
    const createTransport = vi.fn(() => createUnusedTransport());
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      startTextChatStream: textChat.startTextChatStream,
      requestSessionToken,
      createTransport,
    });

    await expect(controller.submitTextTurn('Summarize the current screen')).resolves.toBe(true);

    expect(requestSessionToken).not.toHaveBeenCalled();
    expect(createTransport).not.toHaveBeenCalled();
    expect(textChat.getLastRequest()).toEqual({
      messages: [{ role: 'user', content: 'Summarize the current screen' }],
    });
    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Summarize the current screen',
        state: 'complete',
      }),
    ]);
    expect(useSessionStore.getState().textSessionLifecycle.status).toBe('sending');
    expect(selectAssistantRuntimeState(useSessionStore.getState())).toBe('thinking');

    textChat.emit({ type: 'text-delta', text: 'Here is' });
    textChat.emit({ type: 'text-delta', text: ' the current screen summary.' });
    expect(useSessionStore.getState().textSessionLifecycle.status).toBe('receiving');

    textChat.emit({ type: 'completed' });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Summarize the current screen',
      }),
      expect.objectContaining({
        role: 'assistant',
        content: 'Here is the current screen summary.',
        state: 'complete',
      }),
    ]);
    expect(useSessionStore.getState().textSessionLifecycle.status).toBe('completed');
    expect(selectAssistantRuntimeState(useSessionStore.getState())).toBe('ready');
  });

  it('keeps typed input on the voice transport while speech mode is active', async () => {
    const textChat = createTextChatHarness();
    const voiceTransport = createVoiceTransportHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn(),
      startTextChatStream: textChat.startTextChatStream,
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn(() => voiceTransport.transport),
    });

    await controller.startSession({ mode: 'voice' });

    await expect(controller.submitTextTurn('Keep going')).resolves.toBe(true);

    expect(voiceTransport.sendText).toHaveBeenCalledWith('Keep going');
    expect(textChat.startTextChatStream).not.toHaveBeenCalled();
    expect(useSessionStore.getState().currentMode).toBe('speech');
    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Keep going',
        state: 'complete',
      }),
    ]);
  });

  it('sends the full completed conversation history on each turn', async () => {
    const textChat = createTextChatHarness();
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

    await controller.submitTextTurn('First question');
    textChat.emit({ type: 'text-delta', text: 'First answer' });
    textChat.emit({ type: 'completed' });

    await controller.submitTextTurn('Second question');

    expect(textChat.getLastRequest()).toEqual({
      messages: [
        { role: 'user', content: 'First question' },
        { role: 'assistant', content: 'First answer' },
        { role: 'user', content: 'Second question' },
      ],
    });
  });

  it('persists the user turn before request execution and builds the request from canonical history', async () => {
    const textChat = createTextChatHarness();
    const chat = {
      id: 'chat-1',
      title: null,
      createdAt: '2026-03-12T09:00:00.000Z',
      updatedAt: '2026-03-12T09:00:00.000Z',
      isCurrent: true,
    };
    persistedMessages = [
      {
        id: 'message-1',
        chatId: chat.id,
        role: 'user',
        contentText: 'Persisted question',
        createdAt: '2026-03-12T09:01:00.000Z',
        sequence: 1,
      },
      {
        id: 'message-2',
        chatId: chat.id,
        role: 'assistant',
        contentText: 'Persisted answer',
        createdAt: '2026-03-12T09:02:00.000Z',
        sequence: 2,
      },
    ];

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

    useSessionStore.getState().replaceConversationTurns([
      {
        id: 'renderer-only-user',
        role: 'user',
        content: 'Renderer only question',
        timestamp: '9:00 AM',
        state: 'complete',
      },
      {
        id: 'renderer-only-assistant',
        role: 'assistant',
        content: 'Renderer only answer',
        timestamp: '9:01 AM',
        state: 'complete',
      },
    ]);

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

    await expect(controller.submitTextTurn('Canonical follow-up')).resolves.toBe(true);

    expect(window.bridge.appendChatMessage).toHaveBeenCalledWith({
      chatId: chat.id,
      role: 'user',
      contentText: 'Canonical follow-up',
    });
    expect(
      (window.bridge.appendChatMessage as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0],
    ).toBeLessThan(textChat.startTextChatStream.mock.invocationCallOrder[0]!);
    expect(textChat.getLastRequest()).toEqual({
      messages: [
        { role: 'user', content: 'Persisted question' },
        { role: 'assistant', content: 'Persisted answer' },
        { role: 'user', content: 'Canonical follow-up' },
      ],
    });
    expect(useSessionStore.getState().conversationTurns.at(-1)).toEqual(
      expect.objectContaining({
        role: 'user',
        content: 'Canonical follow-up',
        persistedMessageId: 'message-3',
      }),
    );
  });

  it('persists assistant text only when the text turn finalizes and avoids duplicate commits', async () => {
    const textChat = createTextChatHarness();
    const chat = {
      id: 'chat-1',
      title: null,
      createdAt: '2026-03-12T09:00:00.000Z',
      updatedAt: '2026-03-12T09:00:00.000Z',
      isCurrent: true,
    };
    persistedMessages = [];

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

    await controller.submitTextTurn('Hello');

    expect(persistedMessages).toEqual([
      expect.objectContaining({
        role: 'user',
        contentText: 'Hello',
        sequence: 1,
      }),
    ]);

    textChat.emit({ type: 'text-delta', text: 'Partial' });
    await vi.waitFor(() => {
      expect(window.bridge.appendChatMessage).toHaveBeenCalledTimes(1);
    });

    textChat.emit({ type: 'completed' });
    textChat.emit({ type: 'completed' });

    await vi.waitFor(() => {
      expect(persistedMessages).toEqual([
        expect.objectContaining({
          role: 'user',
          contentText: 'Hello',
          sequence: 1,
        }),
        expect.objectContaining({
          role: 'assistant',
          contentText: 'Partial',
          sequence: 2,
        }),
      ]);
    });
    expect(window.bridge.appendChatMessage).toHaveBeenCalledTimes(2);
  });

  it('retains canonical text history across restart when building the next request', async () => {
    const firstTextChat = createTextChatHarness();
    const secondTextChat = createTextChatHarness();
    const chat = {
      id: 'chat-1',
      title: null,
      createdAt: '2026-03-12T09:00:00.000Z',
      updatedAt: '2026-03-12T09:00:00.000Z',
      isCurrent: true,
    };
    persistedMessages = [];

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
      startTextChatStream: firstTextChat.startTextChatStream,
      requestSessionToken: vi.fn(),
      createTransport: vi.fn(() => createUnusedTransport()),
    });

    await controller.submitTextTurn('First question');
    firstTextChat.emit({ type: 'text-delta', text: 'First answer' });
    firstTextChat.emit({ type: 'completed' });
    await vi.waitFor(() => {
      expect(persistedMessages).toHaveLength(2);
    });

    useSessionStore.getState().reset();
    resetCurrentChatMemoryForTests();

    const restartedController = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      startTextChatStream: secondTextChat.startTextChatStream,
      requestSessionToken: vi.fn(),
      createTransport: vi.fn(() => createUnusedTransport()),
    });

    await restartedController.submitTextTurn('Second question');

    expect(secondTextChat.getLastRequest()).toEqual({
      messages: [
        { role: 'user', content: 'First question' },
        { role: 'assistant', content: 'First answer' },
        { role: 'user', content: 'Second question' },
      ],
    });
  });

  it('maps backend stream errors into an inline failed assistant turn', async () => {
    const textChat = createTextChatHarness();
    const logger: RuntimeLogger = {
      onSessionEvent: vi.fn(),
      onTransportEvent: vi.fn(),
    };
    const controller = createDesktopSessionController({
      logger,
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      startTextChatStream: textChat.startTextChatStream,
      requestSessionToken: vi.fn(),
      createTransport: vi.fn(() => createUnusedTransport()),
    });

    await controller.submitTextTurn('Summarize the current screen');
    textChat.emit({ type: 'text-delta', text: 'Partial response' });
    textChat.emit({ type: 'error', detail: 'backend overloaded' });

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        textSessionLifecycle: expect.objectContaining({ status: 'error' }),
        sessionPhase: 'error',
        activeTransport: null,
        lastRuntimeError: 'backend overloaded',
      }),
    );
    expect(useSessionStore.getState().conversationTurns.at(-1)).toEqual(
      expect.objectContaining({
        role: 'assistant',
        content: 'Partial response',
        state: 'error',
        statusLabel: 'Response failed',
      }),
    );
    expect(logger.onTransportEvent).toHaveBeenCalledWith({
      type: 'error',
      detail: 'backend overloaded',
    });
    expect(window.bridge.appendChatMessage).toHaveBeenCalledTimes(1);
  });

  it('keeps the persisted user turn visible when text chat cannot start', async () => {
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      startTextChatStream: vi.fn().mockRejectedValue(new Error('stream setup failed')),
      requestSessionToken: vi.fn(),
      createTransport: vi.fn(() => createUnusedTransport()),
    });

    await expect(controller.submitTextTurn('Summarize the current screen')).resolves.toBe(
      false,
    );

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Summarize the current screen',
        persistedMessageId: 'user-message-1',
      }),
    ]);
    expect(useSessionStore.getState().lastRuntimeError).toBe('stream setup failed');
  });

  it('blocks a second submit while the current turn is still in flight', async () => {
    const textChat = createTextChatHarness();
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

    await controller.submitTextTurn('First turn');

    await expect(controller.submitTextTurn('Second turn')).resolves.toBe(false);
    expect(textChat.startTextChatStream).toHaveBeenCalledTimes(1);
  });

  it('calls cancel on the text stream when a turn completes to release IPC listeners', async () => {
    const textChat = createTextChatHarness();
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

    await controller.submitTextTurn('Hello');
    textChat.emit({ type: 'text-delta', text: 'Hi' });
    textChat.emit({ type: 'completed' });

    expect(textChat.cancel).toHaveBeenCalledTimes(1);
  });

  it('calls cancel on the text stream when a stream error occurs', async () => {
    const textChat = createTextChatHarness();
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

    await controller.submitTextTurn('Hello');
    textChat.emit({ type: 'error', detail: 'server error' });

    expect(textChat.cancel).toHaveBeenCalledTimes(1);
  });
});
