import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDesktopSessionController } from './sessionController';
import { useSessionStore } from '../store/sessionStore';
import { useSettingsStore } from '../store/settingsStore';
import { DEFAULT_DESKTOP_SETTINGS } from '../../shared/settings';
import {
  createVoiceTransportHarness,
  createVoiceCaptureHarness,
  createVoicePlaybackHarness,
  createTextChatHarness,
} from './sessionController.testUtils';

describe('createDesktopSessionController – mode switching', () => {
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

  it('switches from text mode to speech mode by tearing down text first', async () => {
    const textChat = createTextChatHarness();
    const voiceTransport = createVoiceTransportHarness();
    const requestSessionToken = vi.fn().mockResolvedValue({
      token: 'auth_tokens/test-token',
      expireTime: '2099-03-09T12:30:00.000Z',
      newSessionExpireTime: '2099-03-09T12:01:30.000Z',
    });
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      startTextChatStream: textChat.startTextChatStream,
      requestSessionToken,
      createTransport: vi.fn(() => voiceTransport.transport),
    });

    await controller.submitTextTurn('Summarize the current screen');

    expect(useSessionStore.getState().currentMode).toBe('text');
    expect(useSessionStore.getState().textSessionLifecycle.status).toBe('sending');

    await controller.startSession({ mode: 'voice' });

    expect(textChat.cancel).toHaveBeenCalledTimes(1);
    expect(requestSessionToken).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        currentMode: 'speech',
        speechLifecycle: expect.objectContaining({
          status: 'listening',
        }),
        voiceCaptureState: 'capturing',
        voiceSessionStatus: 'ready',
        activeTransport: 'gemini-live',
        textSessionLifecycle: expect.objectContaining({
          status: 'disconnected',
        }),
      }),
    );
  });

  it('keeps speech mode active when typed input is submitted during an active speech session', async () => {
    const textChat = createTextChatHarness();
    const voiceTransport = createVoiceTransportHarness();
    const voiceCapture = createVoiceCaptureHarness();
    const voicePlayback = createVoicePlaybackHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      startTextChatStream: textChat.startTextChatStream,
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn(() => voiceTransport.transport),
      createVoiceCapture: voiceCapture.createVoiceCapture,
      createVoicePlayback: voicePlayback.createVoicePlayback,
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });
    voiceCapture.emitChunk();
    await Promise.resolve();
    voiceTransport.emit({ type: 'audio-chunk', chunk: new Uint8Array([1, 2, 3, 4]) });
    await Promise.resolve();

    await controller.submitTextTurn('Keep speaking');

    expect(voiceCapture.stop).not.toHaveBeenCalled();
    expect(voiceTransport.sendAudioStreamEnd).not.toHaveBeenCalled();
    expect(voiceTransport.disconnect).not.toHaveBeenCalled();
    expect(textChat.getLastRequest()).toBeNull();
    expect(voiceTransport.sendText).toHaveBeenCalledWith('Keep speaking');
    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        currentMode: 'speech',
        speechLifecycle: expect.objectContaining({
          status: 'assistantSpeaking',
        }),
        activeTransport: 'gemini-live',
      }),
    );
  });

  it('never persists simultaneous active text and speech runtime state after a text submit switch', async () => {
    const textChat = createTextChatHarness();
    const voiceTransport = createVoiceTransportHarness();
    const voiceCapture = createVoiceCaptureHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      startTextChatStream: textChat.startTextChatStream,
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn(() => voiceTransport.transport),
      createVoiceCapture: voiceCapture.createVoiceCapture,
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });
    voiceCapture.emitChunk();
    await Promise.resolve();

    await controller.submitTextTurn('hello from text');

    expect(useSessionStore.getState().currentMode).toBe('speech');
    expect(useSessionStore.getState().speechLifecycle.status).not.toBe('off');
    expect(useSessionStore.getState().voiceSessionStatus).not.toBe('disconnected');
    expect(useSessionStore.getState().activeTransport).toBe('gemini-live');
    expect(textChat.getLastRequest()).toBeNull();
  });

  it('ends speech mode without clearing history and allows continued text chat', async () => {
    const textChat = createTextChatHarness();
    const voiceTransport = createVoiceTransportHarness();
    const voiceCapture = createVoiceCaptureHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      startTextChatStream: textChat.startTextChatStream,
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn(() => voiceTransport.transport),
      createVoiceCapture: voiceCapture.createVoiceCapture,
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });
    voiceTransport.emit({ type: 'input-transcript', text: 'Speech request' });
    voiceTransport.emit({ type: 'output-transcript', text: 'Speech reply' });
    voiceTransport.emit({ type: 'turn-complete' });
    await vi.waitFor(() => {
      expect(persistedMessages).toHaveLength(2);
    });

    await controller.endSpeechMode();

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        currentMode: 'text',
        speechLifecycle: expect.objectContaining({
          status: 'off',
        }),
        voiceSessionStatus: 'disconnected',
        activeTransport: null,
        conversationTurns: [
          expect.objectContaining({
            role: 'user',
            content: 'Speech request',
            state: 'complete',
            source: 'voice',
          }),
          expect.objectContaining({
            role: 'assistant',
            content: 'Speech reply',
            state: 'complete',
            source: 'voice',
          }),
        ],
      }),
    );

    await expect(controller.submitTextTurn('Text after end')).resolves.toBe(true);

    expect(textChat.getLastRequest()).toEqual({
      messages: [
        { role: 'user', content: 'Speech request' },
        { role: 'assistant', content: 'Speech reply' },
        { role: 'user', content: 'Text after end' },
      ],
    });
  });

  it('starts fresh speech turns after speech mode ends without mutating preserved history', async () => {
    const voiceTransport = createVoiceTransportHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      startTextChatStream: createTextChatHarness().startTextChatStream,
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn(() => voiceTransport.transport),
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });
    voiceTransport.emit({ type: 'input-transcript', text: 'First speech request' });
    voiceTransport.emit({ type: 'output-transcript', text: 'First speech reply' });
    voiceTransport.emit({ type: 'turn-complete' });

    await controller.endSpeechMode();
    await controller.startSession({ mode: 'voice' });

    voiceTransport.emit({ type: 'input-transcript', text: 'Second speech request' });
    voiceTransport.emit({ type: 'output-transcript', text: 'Second speech reply' });
    voiceTransport.emit({ type: 'turn-complete' });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'user-turn-1',
        role: 'user',
        content: 'First speech request',
        state: 'complete',
        source: 'voice',
      }),
      expect.objectContaining({
        id: 'assistant-turn-1',
        role: 'assistant',
        content: 'First speech reply',
        state: 'complete',
        source: 'voice',
      }),
      expect.objectContaining({
        id: 'user-turn-2',
        role: 'user',
        content: 'Second speech request',
        state: 'complete',
        source: 'voice',
      }),
      expect.objectContaining({
        id: 'assistant-turn-2',
        role: 'assistant',
        content: 'Second speech reply',
        state: 'complete',
        source: 'voice',
      }),
    ]);
  });

  it('keeps full conversation reset separate from speech-mode teardown', async () => {
    const textChat = createTextChatHarness();
    const voiceTransport = createVoiceTransportHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      startTextChatStream: textChat.startTextChatStream,
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn(() => voiceTransport.transport),
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });
    voiceTransport.emit({ type: 'input-transcript', text: 'Speech request' });
    voiceTransport.emit({ type: 'turn-complete' });

    await controller.endSpeechMode();

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Speech request',
        source: 'voice',
      }),
    ]);

    await controller.endSession();

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        currentMode: 'text',
        speechLifecycle: expect.objectContaining({
          status: 'off',
        }),
        voiceSessionStatus: 'disconnected',
        activeTransport: null,
        conversationTurns: [],
      }),
    );
  });
});
