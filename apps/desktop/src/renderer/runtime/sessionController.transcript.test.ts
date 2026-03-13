import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDesktopSessionController } from './sessionController';
import { resetCurrentChatMemoryForTests } from '../chatMemory/currentChatMemory';
import { useSessionStore } from '../store/sessionStore';
import { useSettingsStore } from '../store/settingsStore';
import { DEFAULT_DESKTOP_SETTINGS } from '../../shared/settings';
import {
  createVoiceTransportHarness,
  createVoicePlaybackHarness,
} from './sessionController.testUtils';

describe('createDesktopSessionController – transcript', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
    useSettingsStore.setState({
      settings: DEFAULT_DESKTOP_SETTINGS,
      isReady: true,
    });
    resetCurrentChatMemoryForTests();
  });

  it('stores live voice transcripts in the conversation timeline and rolls the compatibility transcript on the next user turn', async () => {
    const voiceTransport = createVoiceTransportHarness();
    const voicePlayback = createVoicePlaybackHarness();
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
      createVoicePlayback: voicePlayback.createVoicePlayback,
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });

    voiceTransport.emit({ type: 'input-transcript', text: 'Hello' });
    voiceTransport.emit({ type: 'input-transcript', text: 'Hello there' });
    voiceTransport.emit({ type: 'output-transcript', text: 'Hi' });
    voiceTransport.emit({ type: 'audio-chunk', chunk: new Uint8Array([1, 2, 3, 4]) });
    voiceTransport.emit({ type: 'turn-complete' });

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        conversationTurns: [
          expect.objectContaining({
            role: 'user',
            content: 'Hello there',
            state: 'complete',
            source: 'voice',
          }),
          expect.objectContaining({
            role: 'assistant',
            content: 'Hi',
            state: 'complete',
            source: 'voice',
          }),
        ],
        currentVoiceTranscript: {
          user: {
            text: 'Hello there',
          },
          assistant: {
            text: 'Hi',
          },
        },
      }),
    );
    expect(voicePlayback.enqueue).toHaveBeenCalledWith(new Uint8Array([1, 2, 3, 4]));

    voiceTransport.emit({ type: 'input-transcript', text: 'Next turn' });

    expect(useSessionStore.getState().currentVoiceTranscript).toEqual({
      user: {
        text: 'Next turn',
      },
      assistant: {
        text: '',
      },
    });
    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Hello there',
        state: 'complete',
        source: 'voice',
      }),
      expect.objectContaining({
        role: 'assistant',
        content: 'Hi',
        state: 'complete',
        source: 'voice',
      }),
      expect.objectContaining({
        role: 'user',
        content: 'Next turn',
        state: 'streaming',
        source: 'voice',
      }),
    ]);
  });

  it('updates the same in-progress assistant voice turn until the turn completes', async () => {
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
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });

    voiceTransport.emit({ type: 'output-transcript', text: 'Hi' });
    voiceTransport.emit({ type: 'output-transcript', text: 'Hi there' });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'assistant-turn-1',
        role: 'assistant',
        content: 'Hi there',
        state: 'streaming',
        source: 'voice',
      }),
    ]);
    expect(useSessionStore.getState().currentVoiceTranscript.assistant.text).toBe('Hi there');

    voiceTransport.emit({ type: 'turn-complete' });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'assistant-turn-1',
        role: 'assistant',
        content: 'Hi there',
        state: 'complete',
        source: 'voice',
      }),
    ]);
  });

  it('keeps early assistant transcript text and ignores a shorter stale late update', async () => {
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
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });

    voiceTransport.emit({ type: 'output-transcript', text: 'Hi' });
    voiceTransport.emit({ type: 'output-transcript', text: ' there' });
    voiceTransport.emit({ type: 'output-transcript', text: 'Hi there, corrected' });
    voiceTransport.emit({ type: 'output-transcript', text: 'Hi there' });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'assistant-turn-1',
        content: 'Hi there, corrected',
        state: 'streaming',
        source: 'voice',
      }),
    ]);
    expect(useSessionStore.getState().currentVoiceTranscript.assistant.text).toBe(
      'Hi there, corrected',
    );

    voiceTransport.emit({ type: 'turn-complete' });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'assistant-turn-1',
        content: 'Hi there, corrected',
        state: 'complete',
        source: 'voice',
      }),
    ]);
  });

  it('preserves early assistant text when transcript chunks arrive as suffix updates', async () => {
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
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });

    voiceTransport.emit({ type: 'output-transcript', text: 'Hello' });
    voiceTransport.emit({ type: 'output-transcript', text: ' there' });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'assistant-turn-1',
        role: 'assistant',
        content: 'Hello there',
        state: 'streaming',
        source: 'voice',
      }),
    ]);
    expect(useSessionStore.getState().currentVoiceTranscript.assistant.text).toBe('Hello there');
  });

  it('ignores a shorter stale assistant update after better text already arrived', async () => {
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
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });

    voiceTransport.emit({ type: 'output-transcript', text: 'Hello there' });
    voiceTransport.emit({ type: 'output-transcript', text: 'Hello' });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'assistant-turn-1',
        role: 'assistant',
        content: 'Hello there',
        state: 'streaming',
        source: 'voice',
      }),
    ]);
    expect(useSessionStore.getState().currentVoiceTranscript.assistant.text).toBe('Hello there');
  });

  it('finalizes the same spoken user turn inside the conversation timeline even without assistant transcript', async () => {
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
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });

    voiceTransport.emit({ type: 'input-transcript', text: 'Only the user spoke' });
    voiceTransport.emit({ type: 'turn-complete' });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'user-turn-1',
        role: 'user',
        content: 'Only the user spoke',
        state: 'complete',
        source: 'voice',
      }),
    ]);
    expect(useSessionStore.getState().currentVoiceTranscript).toEqual({
      user: {
        text: 'Only the user spoke',
      },
      assistant: {
        text: '',
      },
    });
  });

  it('creates an in-progress assistant voice bubble when audio arrives before transcript text', async () => {
    const voiceTransport = createVoiceTransportHarness();
    const voicePlayback = createVoicePlaybackHarness();
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
      createVoicePlayback: voicePlayback.createVoicePlayback,
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });

    voiceTransport.emit({ type: 'audio-chunk', chunk: new Uint8Array([1, 2, 3, 4]) });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'assistant-turn-1',
        role: 'assistant',
        content: '',
        state: 'streaming',
        statusLabel: 'Responding...',
        source: 'voice',
      }),
    ]);

    voiceTransport.emit({ type: 'output-transcript', text: 'Audio-first answer' });
    voiceTransport.emit({ type: 'turn-complete' });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'assistant-turn-1',
        role: 'assistant',
        content: 'Audio-first answer',
        state: 'complete',
        source: 'voice',
      }),
    ]);
    expect(voicePlayback.enqueue).toHaveBeenCalledWith(new Uint8Array([1, 2, 3, 4]));
  });

  it('promotes the latest assistant transcript as interruption-final output when the turn is interrupted', async () => {
    const voiceTransport = createVoiceTransportHarness();
    const voicePlayback = createVoicePlaybackHarness();
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
      createVoicePlayback: voicePlayback.createVoicePlayback,
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });

    voiceTransport.emit({ type: 'output-transcript', text: 'Partial answer' });
    voiceTransport.emit({ type: 'audio-chunk', chunk: new Uint8Array([1, 2, 3, 4]) });
    voiceTransport.emit({ type: 'interrupted' });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'assistant-turn-1',
        role: 'assistant',
        content: 'Partial answer',
        state: 'complete',
        statusLabel: 'Interrupted',
        source: 'voice',
      }),
    ]);
    expect(useSessionStore.getState().currentVoiceTranscript).toEqual({
      user: {
        text: '',
      },
      assistant: {
        text: 'Partial answer',
      },
    });
  });

  it('removes an empty assistant placeholder when audio is interrupted before transcript text arrives', async () => {
    const voiceTransport = createVoiceTransportHarness();
    const voicePlayback = createVoicePlaybackHarness();
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
      createVoicePlayback: voicePlayback.createVoicePlayback,
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });

    voiceTransport.emit({ type: 'audio-chunk', chunk: new Uint8Array([1, 2, 3, 4]) });
    voiceTransport.emit({ type: 'interrupted' });

    expect(useSessionStore.getState().conversationTurns).toEqual([]);
    expect(useSessionStore.getState().currentVoiceTranscript).toEqual({
      user: {
        text: '',
      },
      assistant: {
        text: '',
      },
    });
    expect(voicePlayback.enqueue).toHaveBeenCalledWith(new Uint8Array([1, 2, 3, 4]));
  });

  it('starts a fresh streaming user turn after an assistant-only interruption settles', async () => {
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
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });

    voiceTransport.emit({ type: 'output-transcript', text: 'Partial answer' });
    voiceTransport.emit({ type: 'interrupted' });
    voiceTransport.emit({ type: 'input-transcript', text: 'Next question' });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'assistant-turn-1',
        role: 'assistant',
        content: 'Partial answer',
        state: 'complete',
        statusLabel: 'Interrupted',
        source: 'voice',
      }),
      expect.objectContaining({
        id: 'user-turn-1',
        role: 'user',
        content: 'Next question',
        state: 'streaming',
        source: 'voice',
      }),
    ]);
    expect(useSessionStore.getState().currentVoiceTranscript).toEqual({
      user: {
        text: 'Next question',
      },
      assistant: {
        text: '',
      },
    });
  });

  it('does not duplicate the promoted assistant turn when turn-complete arrives after interruption', async () => {
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
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });

    voiceTransport.emit({ type: 'output-transcript', text: 'Interrupted answer' });
    voiceTransport.emit({ type: 'interrupted' });
    voiceTransport.emit({ type: 'turn-complete' });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'assistant-turn-1',
        role: 'assistant',
        content: 'Interrupted answer',
        state: 'complete',
        statusLabel: 'Interrupted',
        source: 'voice',
      }),
    ]);
  });

  it('keeps an interrupted assistant turn labeled interrupted when turn-complete arrives later', async () => {
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
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });

    voiceTransport.emit({ type: 'output-transcript', text: 'Interrupted answer' });
    voiceTransport.emit({ type: 'interrupted' });
    voiceTransport.emit({ type: 'turn-complete' });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'assistant-turn-1',
        role: 'assistant',
        content: 'Interrupted answer',
        state: 'complete',
        statusLabel: 'Interrupted',
        source: 'voice',
      }),
    ]);
  });

  it('keeps interrupted assistant output marked as interrupted when corrective text arrives before turn-complete', async () => {
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
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });

    voiceTransport.emit({ type: 'output-transcript', text: 'Interrupted answer' });
    voiceTransport.emit({ type: 'interrupted' });
    voiceTransport.emit({ type: 'output-transcript', text: 'Interrupted answer corrected' });
    voiceTransport.emit({ type: 'turn-complete' });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'assistant-turn-1',
        role: 'assistant',
        content: 'Interrupted answer corrected',
        state: 'complete',
        statusLabel: 'Interrupted',
        source: 'voice',
      }),
    ]);
    expect(useSessionStore.getState().currentVoiceTranscript.assistant.text).toBe(
      'Interrupted answer corrected',
    );
  });

  it('does not finalize a voice turn on generation-complete before turn-complete arrives', async () => {
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
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });

    voiceTransport.emit({ type: 'output-transcript', text: 'Almost done' });
    voiceTransport.emit({ type: 'generation-complete' });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'assistant-turn-1',
        content: 'Almost done',
        state: 'streaming',
        source: 'voice',
      }),
    ]);

    voiceTransport.emit({ type: 'turn-complete' });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'assistant-turn-1',
        content: 'Almost done',
        state: 'complete',
        source: 'voice',
      }),
    ]);
  });

  it('persists the explicit assistant draft on turn-complete instead of the transcript bubble text', async () => {
    const persistedMessages: Array<{
      id: string;
      chatId: string;
      role: 'user' | 'assistant';
      contentText: string;
      createdAt: string;
      sequence: number;
    }> = [];
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
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });

    voiceTransport.emit({ type: 'output-transcript', text: 'Transcript bubble reply' });
    voiceTransport.emit({ type: 'text-delta', text: 'Canonical' });
    voiceTransport.emit({ type: 'text-delta', text: ' reply' });
    voiceTransport.emit({ type: 'turn-complete' });

    await vi.waitFor(() => {
      expect(window.bridge.appendChatMessage).toHaveBeenCalledWith({
        chatId: 'chat-1',
        role: 'assistant',
        contentText: 'Canonical reply',
      });
    });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'assistant-turn-1',
        content: 'Transcript bubble reply',
        state: 'complete',
        source: 'voice',
        persistedMessageId: 'assistant-message-1',
      }),
    ]);
  });

  it('does not persist interrupted assistant output as a completed canonical assistant message', async () => {
    const persistedMessages: Array<{
      id: string;
      chatId: string;
      role: 'user' | 'assistant';
      contentText: string;
      createdAt: string;
      sequence: number;
    }> = [];
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
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });

    voiceTransport.emit({ type: 'output-transcript', text: 'Interrupted transcript reply' });
    voiceTransport.emit({ type: 'text-delta', text: 'Interrupted canonical reply' });
    voiceTransport.emit({ type: 'interrupted' });
    voiceTransport.emit({ type: 'turn-complete' });

    await vi.waitFor(() => {
      expect(useSessionStore.getState().conversationTurns).toEqual([
        expect.objectContaining({
          id: 'assistant-turn-1',
          content: 'Interrupted transcript reply',
          statusLabel: 'Interrupted',
          source: 'voice',
        }),
      ]);
    });

    expect(window.bridge.appendChatMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'assistant',
        contentText: 'Interrupted canonical reply',
      }),
    );
    expect(persistedMessages).toEqual([]);
  });

  it('normalizes corrective transcript updates and clears voice transcripts on session end', async () => {
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
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });

    voiceTransport.emit({ type: 'input-transcript', text: 'Hello' });
    voiceTransport.emit({ type: 'input-transcript', text: 'Hello there' });
    voiceTransport.emit({ type: 'input-transcript', text: 'Hello there again' });
    voiceTransport.emit({ type: 'output-transcript', text: 'Hi' });
    voiceTransport.emit({ type: 'output-transcript', text: ' there' });
    voiceTransport.emit({ type: 'output-transcript', text: 'Hi there, corrected' });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'user-turn-1',
        role: 'user',
        content: 'Hello there again',
        state: 'streaming',
        source: 'voice',
      }),
      expect.objectContaining({
        id: 'assistant-turn-1',
        role: 'assistant',
        content: 'Hi there, corrected',
        state: 'streaming',
        source: 'voice',
      }),
    ]);
    expect(useSessionStore.getState().currentVoiceTranscript).toEqual({
      user: {
        text: 'Hello there again',
      },
      assistant: {
        text: 'Hi there, corrected',
      },
    });

    await controller.endSession();

    expect(useSessionStore.getState().currentVoiceTranscript).toEqual({
      user: {
        text: '',
      },
      assistant: {
        text: '',
      },
    });
  });

  it('does not leave streaming assistant artifacts behind when speech mode ends mid-turn', async () => {
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
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });

    voiceTransport.emit({ type: 'input-transcript', text: 'Speech request' });
    voiceTransport.emit({ type: 'output-transcript', text: 'Partial speech reply' });

    await controller.endSpeechMode();

    expect(useSessionStore.getState().currentVoiceTranscript).toEqual({
      user: {
        text: '',
      },
      assistant: {
        text: '',
      },
    });
    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'user-turn-1',
        role: 'user',
        content: 'Speech request',
        state: 'complete',
        source: 'voice',
      }),
      expect.objectContaining({
        id: 'assistant-turn-1',
        role: 'assistant',
        content: 'Partial speech reply',
        state: 'complete',
        statusLabel: 'Interrupted',
        source: 'voice',
      }),
    ]);
  });

  it('keeps a typed speech-mode follow-up below earlier history and above its assistant reply', async () => {
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
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });

    voiceTransport.emit({ type: 'input-transcript', text: 'Earlier spoken request' });
    voiceTransport.emit({ type: 'output-transcript', text: 'Earlier spoken reply' });
    voiceTransport.emit({ type: 'turn-complete' });

    await expect(controller.submitTextTurn('Typed follow-up')).resolves.toBe(true);

    voiceTransport.emit({ type: 'output-transcript', text: 'Typed follow-up reply' });
    voiceTransport.emit({ type: 'turn-complete' });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Earlier spoken request',
        state: 'complete',
        source: 'voice',
      }),
      expect.objectContaining({
        role: 'assistant',
        content: 'Earlier spoken reply',
        state: 'complete',
        source: 'voice',
      }),
      expect.objectContaining({
        role: 'user',
        content: 'Typed follow-up',
        state: 'complete',
      }),
      expect.objectContaining({
        role: 'assistant',
        content: 'Typed follow-up reply',
        state: 'complete',
        source: 'voice',
      }),
    ]);
  });

  it('keeps mixed-mode ordering stable when a typed follow-up lands during in-progress assistant speech output', async () => {
    const voiceTransport = createVoiceTransportHarness();
    const voicePlayback = createVoicePlaybackHarness();
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
      createVoicePlayback: voicePlayback.createVoicePlayback,
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });

    voiceTransport.emit({ type: 'input-transcript', text: 'Earlier spoken request' });
    voiceTransport.emit({ type: 'output-transcript', text: 'Earlier spoken reply' });

    await expect(controller.submitTextTurn('Typed follow-up')).resolves.toBe(true);

    voiceTransport.emit({ type: 'interrupted' });
    voiceTransport.emit({ type: 'audio-chunk', chunk: new Uint8Array([7, 8, 9]) });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'user-turn-1',
        role: 'user',
        content: 'Earlier spoken request',
        state: 'complete',
        source: 'voice',
      }),
      expect.objectContaining({
        id: 'assistant-turn-1',
        role: 'assistant',
        content: 'Earlier spoken reply',
        state: 'complete',
        statusLabel: 'Interrupted',
        source: 'voice',
      }),
      expect.objectContaining({
        id: 'user-turn-2',
        role: 'user',
        content: 'Typed follow-up',
        state: 'complete',
      }),
      expect.objectContaining({
        id: 'assistant-turn-2',
        role: 'assistant',
        content: '',
        state: 'streaming',
        statusLabel: 'Responding...',
        source: 'voice',
      }),
    ]);
    expect(voicePlayback.enqueue).toHaveBeenCalledWith(new Uint8Array([7, 8, 9]));

    voiceTransport.emit({ type: 'output-transcript', text: 'Typed follow-up reply' });
    voiceTransport.emit({ type: 'turn-complete' });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'user-turn-1',
        role: 'user',
        content: 'Earlier spoken request',
        state: 'complete',
        source: 'voice',
      }),
      expect.objectContaining({
        id: 'assistant-turn-1',
        role: 'assistant',
        content: 'Earlier spoken reply',
        state: 'complete',
        statusLabel: 'Interrupted',
        source: 'voice',
      }),
      expect.objectContaining({
        id: 'user-turn-2',
        role: 'user',
        content: 'Typed follow-up',
        state: 'complete',
      }),
      expect.objectContaining({
        id: 'assistant-turn-2',
        role: 'assistant',
        content: 'Typed follow-up reply',
        state: 'complete',
        source: 'voice',
      }),
    ]);
    expect(
      useSessionStore
        .getState()
        .conversationTurns.filter((turn) => turn.role === 'assistant' && turn.id === 'assistant-turn-2'),
    ).toHaveLength(1);
  });
});
