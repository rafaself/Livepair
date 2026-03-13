import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDesktopSessionController } from './sessionController';
import { useSessionStore } from '../store/sessionStore';
import { useSettingsStore } from '../store/settingsStore';
import { DEFAULT_DESKTOP_SETTINGS } from '../../shared/settings';
import { resetCurrentChatMemoryForTests } from '../chatMemory/currentChatMemory';
import {
  createVoiceTransportHarness,
  createVoiceCaptureHarness,
  createVoicePlaybackHarness,
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

  it('keeps the runtime inactive when typed input is submitted without an active Live session', async () => {
    const requestSessionToken = vi.fn();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken,
      createTransport: vi.fn(() => createVoiceTransportHarness().transport),
    });

    await expect(controller.submitTextTurn('Summarize the current screen')).resolves.toBe(false);

    expect(requestSessionToken).not.toHaveBeenCalled();
    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        currentMode: 'inactive',
        speechLifecycle: expect.objectContaining({
          status: 'off',
        }),
        voiceSessionStatus: 'disconnected',
        activeTransport: null,
        conversationTurns: [],
      }),
    );
  });

  it('keeps speech mode active when typed input is submitted during an active speech session', async () => {
    const voiceTransport = createVoiceTransportHarness();
    const voiceCapture = createVoiceCaptureHarness();
    const voicePlayback = createVoicePlaybackHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
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

  it('never persists simultaneous active text and speech runtime state after a typed Live turn', async () => {
    const voiceTransport = createVoiceTransportHarness();
    const voiceCapture = createVoiceCaptureHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
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
  });

  it('ends speech mode without clearing history and leaves typed input inactive', async () => {
    const voiceTransport = createVoiceTransportHarness();
    const voiceCapture = createVoiceCaptureHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
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
        currentMode: 'inactive',
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

    await expect(controller.submitTextTurn('Text after end')).resolves.toBe(false);

    expect(persistedMessages).toEqual([
      expect.objectContaining({ role: 'user', contentText: 'Speech request' }),
      expect.objectContaining({ role: 'assistant', contentText: 'Speech reply' }),
    ]);
  });

  it('reuses canonical persisted history when speech mode reopens after becoming inactive', async () => {
    persistedMessages = [
      {
        id: 'message-1',
        chatId: 'chat-1',
        role: 'user',
        contentText: 'Persisted text question',
        createdAt: '2026-03-12T09:01:00.000Z',
        sequence: 1,
      },
      {
        id: 'message-2',
        chatId: 'chat-1',
        role: 'assistant',
        contentText: 'Persisted text answer',
        createdAt: '2026-03-12T09:02:00.000Z',
        sequence: 2,
      },
    ];
    const voiceTransport = createVoiceTransportHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn(() => voiceTransport.transport),
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });
    expect(voiceTransport.connect).toHaveBeenNthCalledWith(1, {
      token: {
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      },
      mode: 'voice',
      rehydrationPacket: {
        stableInstruction:
          'Rehydrate this new Live session from the provided saved chat memory only. Prefer the summary and state when present, and use the recent turns as compact fallback context.',
        summary: null,
        recentTurns: [
          {
            role: 'user',
            kind: 'message',
            text: 'Persisted text question',
            createdAt: '2026-03-12T09:01:00.000Z',
            sequence: 1,
          },
          {
            role: 'assistant',
            kind: 'message',
            text: 'Persisted text answer',
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
      },
    });

    await controller.endSpeechMode();
    useSessionStore.getState().replaceConversationTurns([
      {
        id: 'renderer-only-turn',
        role: 'assistant',
        content: 'Renderer-only state should not seed Live',
        timestamp: '9:30 AM',
        state: 'complete',
      },
    ]);

    await controller.startSession({ mode: 'voice' });

    expect(voiceTransport.connect).toHaveBeenNthCalledWith(2, {
      token: {
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      },
      mode: 'voice',
      rehydrationPacket: {
        stableInstruction:
          'Rehydrate this new Live session from the provided saved chat memory only. Prefer the summary and state when present, and use the recent turns as compact fallback context.',
        summary: null,
        recentTurns: [
          {
            role: 'user',
            kind: 'message',
            text: 'Persisted text question',
            createdAt: '2026-03-12T09:01:00.000Z',
            sequence: 1,
          },
          {
            role: 'assistant',
            kind: 'message',
            text: 'Persisted text answer',
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
      },
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
    const voiceTransport = createVoiceTransportHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
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
        currentMode: 'inactive',
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
