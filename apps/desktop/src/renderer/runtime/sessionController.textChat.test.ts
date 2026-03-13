import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeLogger } from './core/session.types';
import { createDesktopSessionController } from './sessionController';
import { useSessionStore } from '../store/sessionStore';
import { resetDesktopStoresWithDefaults } from '../store/testing';
import {
  createVoiceTransportHarness,
} from './sessionController.testUtils';
import { resetCurrentChatMemoryForTests } from '../chatMemory/currentChatMemory';

describe('createDesktopSessionController – typed turns', () => {
  let persistedMessages: Array<{
    id: string;
    chatId: string;
    role: 'user' | 'assistant';
    contentText: string;
    createdAt: string;
    sequence: number;
  }>;

  beforeEach(() => {
    resetDesktopStoresWithDefaults();
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

  it('rejects typed input while no Live session is active', async () => {
    const requestSessionToken = vi.fn();
    const createTransport = vi.fn(() => createVoiceTransportHarness().transport);
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken,
      createTransport,
    });

    await expect(controller.submitTextTurn('Summarize the current screen')).resolves.toBe(false);

    expect(requestSessionToken).not.toHaveBeenCalled();
    expect(createTransport).not.toHaveBeenCalled();
    expect(window.bridge.appendChatMessage).not.toHaveBeenCalled();
    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        currentMode: 'inactive',
        activeTransport: null,
        conversationTurns: [],
        lastRuntimeError: null,
      }),
    );
  });

  it('keeps typed input on the voice transport while speech mode is active', async () => {
    const voiceTransport = createVoiceTransportHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn(),
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn(() => voiceTransport.transport),
    });

    await controller.startSession({ mode: 'speech' });

    await expect(controller.submitTextTurn('Keep going')).resolves.toBe(true);

    expect(voiceTransport.sendText).toHaveBeenCalledWith('Keep going');
    expect(useSessionStore.getState().currentMode).toBe('speech');
    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Keep going',
        state: 'complete',
      }),
    ]);
  });

  it('returns false without mutating runtime state when the active Live transport is unavailable', async () => {
    const logger: RuntimeLogger = {
      onSessionEvent: vi.fn(),
      onTransportEvent: vi.fn(),
    };
    const controller = createDesktopSessionController({
      logger,
      checkBackendHealth: vi.fn(),
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn(() => createVoiceTransportHarness().transport),
    });

    await controller.startSession({ mode: 'speech' });
    await controller.endSpeechMode();

    await expect(controller.submitTextTurn('Retry')).resolves.toBe(false);

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        currentMode: 'inactive',
        activeTransport: null,
        conversationTurns: [],
        lastRuntimeError: null,
      }),
    );
  });
});
