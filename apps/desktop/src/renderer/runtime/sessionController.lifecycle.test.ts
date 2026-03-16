import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeLogger } from './core/session.types';
import { MAX_REHYDRATION_RECENT_TURNS } from '../chatMemory/rehydrationPacket';
import { createDesktopSessionController } from './sessionController';
import { selectAssistantRuntimeState, selectIsConversationEmpty } from './selectors';
import { useSessionStore } from '../store/sessionStore';
import { useSettingsStore } from '../store/settingsStore';
import { resetDesktopStoresWithDefaults } from '../test/store';
import { resetCurrentChatMemoryForTests } from '../chatMemory/currentChatMemory';
import { createGeminiLiveTransport } from './transport/geminiLiveTransport';
import {
  composeLiveSystemInstruction,
  parseLiveConfig,
  type GeminiLiveConnectConfig,
} from './transport/liveConfig';
import type {
  ConnectGeminiLiveSdkSessionOptions,
  GeminiLiveSdkSession,
} from './transport/geminiLiveSdkClient';
import {
  createUnusedTransport,
  createVoiceTransportHarness,
  createVoiceCaptureHarness,
} from './sessionController.testUtils';
import {
  DEFAULT_DESKTOP_SETTINGS,
  DEFAULT_SYSTEM_INSTRUCTION,
} from '../../shared';

const TEST_LIVE_CONFIG = parseLiveConfig({
  provider: 'gemini',
  adapterKey: 'gemini-live',
  model: 'models/gemini-2.0-flash-exp',
  apiVersion: 'v1alpha',
  sessionModes: {
    text: {
      responseModality: 'TEXT',
      inputAudioTranscription: false,
      outputAudioTranscription: false,
    },
    voice: {
      responseModality: 'AUDIO',
      inputAudioTranscription: false,
      outputAudioTranscription: false,
    },
  },
  mediaResolution: 'MEDIA_RESOLUTION_LOW',
  sessionResumptionEnabled: false,
  contextCompressionEnabled: false,
});

function createSdkHarness(): {
  connectSession: ReturnType<typeof vi.fn>;
  getConnectOptions: () => ConnectGeminiLiveSdkSessionOptions | undefined;
} {
  let connectOptions: ConnectGeminiLiveSdkSessionOptions | undefined;
  const session: GeminiLiveSdkSession = {
    sendClientContent: vi.fn(),
    sendRealtimeInput: vi.fn(),
    sendToolResponse: vi.fn(),
    close: vi.fn(),
  };

  return {
    connectSession: vi.fn(async (options: ConnectGeminiLiveSdkSessionOptions) => {
      connectOptions = options;
      queueMicrotask(() => {
        options.callbacks.onMessage({ setupComplete: {} });
      });
      return session;
    }),
    getConnectOptions: () => connectOptions,
  };
}

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
    window.bridge.createLiveSession = vi.fn(async ({ chatId, startedAt }) => ({
      id: 'live-session-1',
      chatId,
      startedAt: startedAt ?? '2026-03-12T09:00:00.000Z',
      endedAt: null,
      status: 'active' as const,
      endedReason: null,
      resumptionHandle: null,
      lastResumptionUpdateAt: null,
      restorable: false,
      invalidatedAt: null,
      invalidationReason: null,
    }));
    window.bridge.listLiveSessions = vi.fn().mockResolvedValue([]);
    window.bridge.endLiveSession = vi.fn(async ({ id, status, endedAt, endedReason }) => ({
      id,
      chatId: 'chat-1',
      startedAt: '2026-03-12T09:00:00.000Z',
      endedAt: endedAt ?? '2026-03-12T09:05:00.000Z',
      status,
      endedReason: endedReason ?? null,
      resumptionHandle: null,
      lastResumptionUpdateAt: null,
      restorable: false,
      invalidatedAt: null,
      invalidationReason: null,
    }));
  });

  it('keeps the runtime inactive when no live session is started', async () => {
    const requestSessionToken = vi.fn();
    const createTransport = vi.fn(() => createUnusedTransport());
    const logger: RuntimeLogger = {
      onSessionEvent: vi.fn(),
      onTransportEvent: vi.fn(),
    };
    createDesktopSessionController({
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

    await controller.startSession({ mode: 'speech' });

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        tokenRequestState: 'success',
        activeTransport: 'gemini-live',
        speechLifecycle: {
          status: 'listening',
        },
        voiceCaptureState: 'idle',
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
      rehydrationPacket: {
        stableInstruction:
          'Rehydrate this new Live session from the provided saved chat memory only. Prefer the summary and state when present, and use the recent turns as compact fallback context.',
        summary: null,
        recentTurns: [],
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
    expect(window.bridge.createLiveSession).toHaveBeenCalledWith({
      chatId: 'chat-1',
      startedAt: expect.any(String),
    });
    expect(voiceCapture.start).not.toHaveBeenCalled();
  });

  it.each(['Puck', 'Kore', 'Aoede'] as const)(
    'uses the persisted %s voice and normalized instruction in the real session startup path',
    async (voice) => {
      const sdkHarness = createSdkHarness();
      const voiceCapture = createVoiceCaptureHarness();

      useSettingsStore.setState({
        settings: {
          ...DEFAULT_DESKTOP_SETTINGS,
          voice,
          systemInstruction: '  Pair on the active code only.  ',
        },
        isReady: true,
      });

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
          const settings = useSettingsStore.getState().settings;
          return createGeminiLiveTransport({
            connectSession: sdkHarness.connectSession,
            config: TEST_LIVE_CONFIG,
            voice: settings.voice,
            systemInstruction: settings.systemInstruction,
          });
        }),
        createVoiceCapture: voiceCapture.createVoiceCapture,
        settingsStore: useSettingsStore,
      });

      await controller.startSession({ mode: 'speech' });

      expect(sdkHarness.getConnectOptions()).toEqual({
        apiKey: 'auth_tokens/test-token',
        apiVersion: 'v1alpha',
        model: 'models/gemini-2.0-flash-exp',
        config: {
          responseModalities: ['AUDIO'],
          mediaResolution: 'MEDIA_RESOLUTION_LOW',
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: voice,
              },
            },
          },
          systemInstruction: composeLiveSystemInstruction('Pair on the active code only.'),
          tools: expect.any(Array),
        } satisfies GeminiLiveConnectConfig,
        callbacks: expect.any(Object),
      });
    },
  );

  it('normalizes malformed persisted Gemini preferences before a new session starts', async () => {
    const sdkHarness = createSdkHarness();
    const voiceCapture = createVoiceCaptureHarness();

    window.bridge.getSettings = vi.fn().mockResolvedValue({
      ...DEFAULT_DESKTOP_SETTINGS,
      voice: 'BadVoice',
      systemInstruction: '   ',
    });

    await useSettingsStore.getState().hydrate();

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
        const settings = useSettingsStore.getState().settings;
        return createGeminiLiveTransport({
          connectSession: sdkHarness.connectSession,
          config: TEST_LIVE_CONFIG,
          voice: settings.voice,
          systemInstruction: settings.systemInstruction,
        });
      }),
      createVoiceCapture: voiceCapture.createVoiceCapture,
      settingsStore: useSettingsStore,
    });

    expect(useSettingsStore.getState().settings).toMatchObject({
      voice: 'Puck',
      systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
    });

    await controller.startSession({ mode: 'speech' });

    expect(sdkHarness.getConnectOptions()).toEqual({
      apiKey: 'auth_tokens/test-token',
      apiVersion: 'v1alpha',
      model: 'models/gemini-2.0-flash-exp',
      config: {
        responseModalities: ['AUDIO'],
        mediaResolution: 'MEDIA_RESOLUTION_LOW',
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: 'Puck',
            },
          },
        },
        systemInstruction: composeLiveSystemInstruction(DEFAULT_SYSTEM_INSTRUCTION),
        tools: expect.any(Array),
      } satisfies GeminiLiveConnectConfig,
      callbacks: expect.any(Object),
    });
  });

  it('attempts persisted live-session resumption before opening a fresh session', async () => {
    const voiceCapture = createVoiceCaptureHarness();
    const resumedTransport = createVoiceTransportHarness();
    window.bridge.listLiveSessions = vi.fn().mockResolvedValue([
      {
        id: 'persisted-live-session-1',
        chatId: 'chat-1',
        startedAt: '2026-03-12T08:55:00.000Z',
        endedAt: null,
        status: 'active',
        endedReason: null,
        resumptionHandle: 'handles/persisted-live-session-1',
        lastResumptionUpdateAt: '2026-03-12T08:56:00.000Z',
        restorable: true,
        invalidatedAt: null,
        invalidationReason: null,
      },
    ]);
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
      createTransport: vi.fn(() => resumedTransport.transport),
      createVoiceCapture: voiceCapture.createVoiceCapture,
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'speech' });

    expect(window.bridge.listLiveSessions).toHaveBeenCalledWith('chat-1');
    expect(resumedTransport.connect).toHaveBeenCalledWith({
      token: {
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      },
      mode: 'voice',
      resumeHandle: 'handles/persisted-live-session-1',
    });
    expect(window.bridge.createLiveSession).not.toHaveBeenCalled();
    expect(useSessionStore.getState().voiceSessionResumption).toEqual({
      status: 'resumed',
      latestHandle: 'handles/persisted-live-session-1',
      resumable: true,
      lastDetail: 'Restoring persisted Live session',
    });
    expect(voiceCapture.start).not.toHaveBeenCalled();
  });

  it('falls back to a new rehydrated Live session when no restore candidate exists', async () => {
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
    window.bridge.listLiveSessions = vi.fn().mockResolvedValue([
      {
        id: 'persisted-live-session-stale',
        chatId: 'chat-1',
        startedAt: '2026-03-12T08:55:00.000Z',
        endedAt: null,
        status: 'active',
        endedReason: null,
        resumptionHandle: null,
        lastResumptionUpdateAt: '2026-03-12T08:56:00.000Z',
        restorable: false,
        invalidatedAt: '2026-03-12T08:56:30.000Z',
        invalidationReason: 'Gemini Live session is not resumable at this point',
      },
    ]);
    window.bridge.createLiveSession = vi.fn(async ({ chatId, startedAt }) => ({
      id: 'live-session-2',
      chatId,
      startedAt: startedAt ?? '2026-03-12T09:10:00.000Z',
      endedAt: null,
      status: 'active' as const,
      endedReason: null,
      resumptionHandle: null,
      lastResumptionUpdateAt: null,
      restorable: false,
      invalidatedAt: null,
      invalidationReason: null,
    }));
    const freshTransport = createVoiceTransportHarness();
    const voiceCapture = createVoiceCaptureHarness();
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
      createTransport: vi.fn(() => freshTransport.transport),
      createVoiceCapture: voiceCapture.createVoiceCapture,
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'speech' });

    expect(window.bridge.listLiveSessions).toHaveBeenCalledWith('chat-1');
    expect(window.bridge.endLiveSession).toHaveBeenCalledWith({
      id: 'persisted-live-session-stale',
      endedAt: expect.any(String),
      status: 'failed',
      endedReason: 'Gemini Live session is not resumable at this point',
    });
    expect(window.bridge.listChatMessages).toHaveBeenCalledWith('chat-1');
    expect(window.bridge.createLiveSession).toHaveBeenCalledWith({
      chatId: 'chat-1',
      startedAt: expect.any(String),
    });
    expect(freshTransport.connect).toHaveBeenCalledWith({
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
            text: 'Persisted question',
            createdAt: '2026-03-12T09:01:00.000Z',
            sequence: 1,
          },
          {
            role: 'assistant',
            kind: 'message',
            text: 'Persisted answer',
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
    expect(useSessionStore.getState().voiceSessionResumption).toEqual({
      status: 'connected',
      latestHandle: null,
      resumable: false,
      lastDetail: null,
    });
    expect(useSessionStore.getState().lastRuntimeError).toBeNull();
    expect(useSessionStore.getState().voiceSessionStatus).toBe('ready');
    expect(voiceCapture.start).not.toHaveBeenCalled();
  });

  it('falls back to a new rehydrated Live session when persisted resumption fails', async () => {
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
    window.bridge.listLiveSessions = vi.fn().mockResolvedValue([
      {
        id: 'persisted-live-session-1',
        chatId: 'chat-1',
        startedAt: '2026-03-12T08:55:00.000Z',
        endedAt: null,
        status: 'active',
        endedReason: null,
        resumptionHandle: 'handles/persisted-live-session-1',
        lastResumptionUpdateAt: '2026-03-12T08:56:00.000Z',
        restorable: true,
        invalidatedAt: null,
        invalidationReason: null,
      },
    ]);
    window.bridge.createLiveSession = vi.fn(async ({ chatId, startedAt }) => ({
      id: 'live-session-2',
      chatId,
      startedAt: startedAt ?? '2026-03-12T09:10:00.000Z',
      endedAt: null,
      status: 'active' as const,
      endedReason: null,
      resumptionHandle: null,
      lastResumptionUpdateAt: null,
      restorable: false,
      invalidatedAt: null,
      invalidationReason: null,
    }));
    const failedResumeTransport = createVoiceTransportHarness();
    failedResumeTransport.setConnectError(new Error('resume rejected'));
    const freshTransport = createVoiceTransportHarness();
    const voiceCapture = createVoiceCaptureHarness();
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
      createTransport: vi
        .fn()
        .mockReturnValueOnce(failedResumeTransport.transport)
        .mockReturnValueOnce(freshTransport.transport),
      createVoiceCapture: voiceCapture.createVoiceCapture,
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'speech' });

    expect(failedResumeTransport.connect).toHaveBeenCalledWith({
      token: {
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      },
      mode: 'voice',
      resumeHandle: 'handles/persisted-live-session-1',
    });
    expect(window.bridge.endLiveSession).toHaveBeenCalledWith({
      id: 'persisted-live-session-1',
      endedAt: expect.any(String),
      status: 'failed',
      endedReason: 'resume rejected',
    });
    expect(window.bridge.updateLiveSession).toHaveBeenCalledWith({
      kind: 'resumption',
      id: 'persisted-live-session-1',
      restorable: false,
      invalidatedAt: expect.any(String),
      invalidationReason: 'resume rejected',
    });
    expect(window.bridge.listChatMessages).toHaveBeenCalledWith('chat-1');
    expect(window.bridge.createLiveSession).toHaveBeenCalledWith({
      chatId: 'chat-1',
      startedAt: expect.any(String),
    });
    expect(freshTransport.connect).toHaveBeenCalledWith({
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
            text: 'Persisted question',
            createdAt: '2026-03-12T09:01:00.000Z',
            sequence: 1,
          },
          {
            role: 'assistant',
            kind: 'message',
            text: 'Persisted answer',
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
    expect(useSessionStore.getState().voiceSessionResumption).toEqual({
      status: 'connected',
      latestHandle: 'handles/persisted-live-session-1',
      resumable: false,
      lastDetail: null,
    });
    expect(useSessionStore.getState().lastRuntimeError).toBeNull();
    expect(useSessionStore.getState().currentMode).toBe('speech');
    expect(useSessionStore.getState().voiceSessionStatus).toBe('ready');
    expect(voiceCapture.start).not.toHaveBeenCalled();
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

    await controller.startSession({ mode: 'speech' });

    expect(window.bridge.listChatMessages).toHaveBeenCalledWith('chat-1');
    expect(voiceTransport.connect).toHaveBeenCalledWith({
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
            text: 'Persisted question',
            createdAt: '2026-03-12T09:01:00.000Z',
            sequence: 1,
          },
          {
            role: 'assistant',
            kind: 'message',
            text: 'Persisted answer',
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

  it('uses a compact rehydration packet for fallback startup with long persisted histories', async () => {
    persistedMessages = Array.from({ length: MAX_REHYDRATION_RECENT_TURNS + 4 }, (_, index) => {
      const sequence = index + 1;

      return {
        id: `message-${sequence}`,
        chatId: 'chat-1',
        role: sequence % 2 === 0 ? 'assistant' : 'user',
        contentText: `Persisted turn ${sequence}`,
        createdAt: `2026-03-12T09:${String(sequence).padStart(2, '0')}:00.000Z`,
        sequence,
      } as const;
    });

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

    await controller.startSession({ mode: 'speech' });

    expect(voiceTransport.connect).toHaveBeenCalledWith({
      token: {
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      },
      mode: 'voice',
      rehydrationPacket: expect.objectContaining({
        summary: null,
        recentTurns: [
          expect.objectContaining({ text: 'Persisted turn 5', sequence: 5 }),
          expect.objectContaining({ text: 'Persisted turn 6', sequence: 6 }),
          expect.objectContaining({ text: 'Persisted turn 7', sequence: 7 }),
          expect.objectContaining({ text: 'Persisted turn 8', sequence: 8 }),
          expect.objectContaining({ text: 'Persisted turn 9', sequence: 9 }),
          expect.objectContaining({ text: 'Persisted turn 10', sequence: 10 }),
        ],
      }),
    });
    expect(voiceTransport.connect.mock.calls[0]?.[0]).not.toHaveProperty('history');
  });

  it('always passes a rehydration packet during fallback startup even when persisted history is empty', async () => {
    persistedMessages = [];

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

    await controller.startSession({ mode: 'speech' });

    expect(voiceTransport.connect).toHaveBeenCalledWith({
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
        recentTurns: [],
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

    await controller.startSession({ mode: 'speech' });

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

    await controller.startSession({ mode: 'speech' });

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

  it('persists live session end metadata when an active Live session stops', async () => {
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

    await controller.startSession({ mode: 'speech' });
    await controller.endSession();

    expect(window.bridge.endLiveSession).toHaveBeenCalledWith({
      id: 'live-session-1',
      status: 'ended',
      endedAt: expect.any(String),
      endedReason: null,
    });
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
