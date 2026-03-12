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

describe('createDesktopSessionController – text chat', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
    useSettingsStore.setState({
      settings: DEFAULT_DESKTOP_SETTINGS,
      isReady: true,
    });
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
  });

  it('does not append a user turn when text chat cannot start', async () => {
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

    expect(useSessionStore.getState().conversationTurns).toEqual([]);
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
