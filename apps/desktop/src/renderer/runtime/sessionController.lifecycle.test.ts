import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeLogger } from './core/session.types';
import { createDesktopSessionController } from './sessionController';
import { selectAssistantRuntimeState, selectIsConversationEmpty } from './selectors';
import { useSessionStore } from '../store/sessionStore';
import { useSettingsStore } from '../store/settingsStore';
import { DEFAULT_DESKTOP_SETTINGS } from '../../shared/settings';
import { resetCurrentChatMemoryForTests } from '../chatMemory/currentChatMemory';
import {
  createUnusedTransport,
  createVoiceTransportHarness,
  createVoiceCaptureHarness,
} from './sessionController.testUtils';

describe('createDesktopSessionController – lifecycle', () => {
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

  it('keeps the runtime inactive when no live session is started', async () => {
    const requestSessionToken = vi.fn();
    const createTransport = vi.fn(() => createUnusedTransport());
    const logger: RuntimeLogger = {
      onSessionEvent: vi.fn(),
      onTransportEvent: vi.fn(),
    };
    const controller = createDesktopSessionController({
      logger,
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken,
      createTransport,
    });

    expect(requestSessionToken).not.toHaveBeenCalled();
    expect(createTransport).not.toHaveBeenCalled();
    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        currentMode: 'inactive',
        textSessionLifecycle: expect.objectContaining({ status: 'idle' }),
        sessionPhase: 'idle',
        backendState: 'idle',
        tokenRequestState: 'idle',
        transportState: 'idle',
        activeTransport: null,
      }),
    );
    expect(selectAssistantRuntimeState(useSessionStore.getState())).toBe('disconnected');
    expect(selectIsConversationEmpty(useSessionStore.getState())).toBe(true);
    expect(logger.onSessionEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'session.start.requested',
      }),
    );
  });

  it('bootstraps a Gemini Live voice session with an ephemeral token', async () => {
    const voiceCapture = createVoiceCaptureHarness();
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
      checkBackendHealth: vi.fn(),
      requestSessionToken,
      createTransport: vi.fn(() => voiceTransport.transport),
      createVoiceCapture: voiceCapture.createVoiceCapture,
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        tokenRequestState: 'success',
        activeTransport: 'gemini-live',
        speechLifecycle: {
          status: 'listening',
        },
        voiceCaptureState: 'capturing',
        voiceSessionStatus: 'ready',
        voiceSessionResumption: {
          status: 'connected',
          latestHandle: null,
          resumable: false,
          lastDetail: null,
        },
        lastRuntimeError: null,
        voiceSessionDurability: {
          compressionEnabled: true,
          tokenValid: true,
          tokenRefreshing: false,
          tokenRefreshFailed: false,
          expireTime: '2099-03-09T12:30:00.000Z',
          newSessionExpireTime: '2099-03-09T12:01:30.000Z',
          lastDetail: null,
        },
      }),
    );
    expect(requestSessionToken).toHaveBeenCalledWith({});
    expect(voiceTransport.connect).toHaveBeenCalledWith({
      token: {
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      },
      mode: 'voice',
    });
    expect(voiceCapture.start).toHaveBeenCalledTimes(1);
  });

  it('seeds a new Live session from canonical persisted chat history instead of renderer-only turns', async () => {
    persistedMessages = [
      {
        id: 'message-1',
        chatId: 'chat-1',
        role: 'user',
        contentText: 'Persisted question',
        createdAt: '2026-03-12T09:01:00.000Z',
        sequence: 1,
      },
      {
        id: 'message-2',
        chatId: 'chat-1',
        role: 'assistant',
        contentText: 'Persisted answer',
        createdAt: '2026-03-12T09:02:00.000Z',
        sequence: 2,
      },
    ];
    useSessionStore.getState().replaceConversationTurns([
      {
        id: 'renderer-only-user',
        role: 'user',
        content: 'Renderer-only question',
        timestamp: '9:05 AM',
        state: 'complete',
      },
      {
        id: 'renderer-only-assistant',
        role: 'assistant',
        content: 'Renderer-only answer',
        timestamp: '9:06 AM',
        state: 'complete',
      },
    ]);

    const voiceCapture = createVoiceCaptureHarness();
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
      createVoiceCapture: voiceCapture.createVoiceCapture,
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });

    expect(window.bridge.listChatMessages).toHaveBeenCalledWith('chat-1');
    expect(voiceTransport.connect).toHaveBeenCalledWith({
      token: {
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      },
      mode: 'voice',
      history: [
        {
          role: 'user',
          parts: [{ text: 'Persisted question' }],
        },
        {
          role: 'model',
          parts: [{ text: 'Persisted answer' }],
        },
      ],
    });
  });

  it('does not promote backend failure state when typed input is blocked outside Live', async () => {
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(false),
      requestSessionToken: vi.fn(),
      createTransport: vi.fn(() => createUnusedTransport()),
    });

    await expect(controller.submitTextTurn('Summarize the current screen')).resolves.toBe(
      false,
    );

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        currentMode: 'inactive',
        textSessionLifecycle: expect.objectContaining({ status: 'idle' }),
        backendState: 'idle',
        lastRuntimeError: null,
        conversationTurns: [],
      }),
    );
  });

  it('surfaces voice bootstrap failures clearly', async () => {
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn(),
      requestSessionToken: vi.fn().mockRejectedValue(new Error('token failed')),
      createTransport: vi.fn(() => createUnusedTransport()),
    });

    await controller.startSession({ mode: 'voice' });

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        currentMode: 'inactive',
        speechLifecycle: expect.objectContaining({
          status: 'off',
        }),
        voiceSessionStatus: 'disconnected',
        lastRuntimeError: 'token failed',
      }),
    );
  });

  it('surfaces invalid voice transport config before connect starts', async () => {
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
      createTransport: vi.fn(() => {
        throw new Error(
          'Invalid Live config: VITE_LIVE_MODEL is required for speech mode',
        );
      }),
    });

    await controller.startSession({ mode: 'voice' });

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        currentMode: 'inactive',
        speechLifecycle: expect.objectContaining({
          status: 'off',
        }),
        voiceSessionStatus: 'disconnected',
        lastRuntimeError: 'Invalid Live config: VITE_LIVE_MODEL is required for speech mode',
      }),
    );
  });

  it('ends an inactive runtime without creating standalone text activity', async () => {
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken: vi.fn(),
      createTransport: vi.fn(() => createUnusedTransport()),
    });

    await controller.endSession();

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        currentMode: 'inactive',
        textSessionLifecycle: expect.objectContaining({ status: 'disconnected' }),
        sessionPhase: 'idle',
        backendState: 'idle',
        transportState: 'idle',
        activeTransport: null,
        conversationTurns: [],
        lastRuntimeError: null,
      }),
    );
    expect(selectAssistantRuntimeState(useSessionStore.getState())).toBe('disconnected');
    expect(selectIsConversationEmpty(useSessionStore.getState())).toBe(true);
  });

  it('sets the assistant debug state and records the matching session event', () => {
    const logger: RuntimeLogger = {
      onSessionEvent: vi.fn(),
      onTransportEvent: vi.fn(),
    };
    const controller = createDesktopSessionController({
      logger,
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      requestSessionToken: vi.fn(),
      createTransport: vi.fn(() => createUnusedTransport()),
    });

    controller.setAssistantState('thinking');

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        assistantActivity: 'thinking',
        textSessionLifecycle: expect.objectContaining({
          status: 'connecting',
        }),
        lastRuntimeError: null,
        lastDebugEvent: expect.objectContaining({
          scope: 'session',
          type: 'session.debug.state.set',
          detail: 'thinking',
        }),
      }),
    );
    expect(logger.onSessionEvent).toHaveBeenCalledWith({
      type: 'session.debug.state.set',
      detail: 'thinking',
    });
  });
});
