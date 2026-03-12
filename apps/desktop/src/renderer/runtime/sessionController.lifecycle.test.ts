import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeLogger } from './core/session.types';
import { createDesktopSessionController } from './sessionController';
import { selectAssistantRuntimeState, selectIsConversationEmpty } from './selectors';
import { useSessionStore } from '../store/sessionStore';
import { useSettingsStore } from '../store/settingsStore';
import { DEFAULT_DESKTOP_SETTINGS } from '../../shared/settings';
import {
  createUnusedTransport,
  createVoiceTransportHarness,
  createVoiceCaptureHarness,
  createTextChatHarness,
} from './sessionController.testUtils';

describe('createDesktopSessionController – lifecycle', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
    useSettingsStore.setState({
      settings: DEFAULT_DESKTOP_SETTINGS,
      isReady: true,
    });
  });

  it('starts text mode through backend health only and does not bootstrap Live', async () => {
    const textChat = createTextChatHarness();
    const requestSessionToken = vi.fn();
    const createTransport = vi.fn(() => createUnusedTransport());
    const logger: RuntimeLogger = {
      onSessionEvent: vi.fn(),
      onTransportEvent: vi.fn(),
    };
    const controller = createDesktopSessionController({
      logger,
      checkBackendHealth: vi.fn().mockResolvedValue(true),
      startTextChatStream: textChat.startTextChatStream,
      requestSessionToken,
      createTransport,
    });

    await controller.startSession({ mode: 'text' });

    expect(requestSessionToken).not.toHaveBeenCalled();
    expect(createTransport).not.toHaveBeenCalled();
    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        textSessionLifecycle: expect.objectContaining({ status: 'ready' }),
        sessionPhase: 'active',
        backendState: 'connected',
        tokenRequestState: 'idle',
        transportState: 'connected',
        activeTransport: 'backend-text',
      }),
    );
    expect(selectAssistantRuntimeState(useSessionStore.getState())).toBe('ready');
    expect(selectIsConversationEmpty(useSessionStore.getState())).toBe(true);
    expect(logger.onSessionEvent).toHaveBeenCalledWith({
      type: 'session.start.requested',
      transport: 'backend-text',
    });
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
      startTextChatStream: createTextChatHarness().startTextChatStream,
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

  it('fails fast when backend health prevents text session start', async () => {
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn().mockResolvedValue(false),
      startTextChatStream: createTextChatHarness().startTextChatStream,
      requestSessionToken: vi.fn(),
      createTransport: vi.fn(() => createUnusedTransport()),
    });

    await expect(controller.submitTextTurn('Summarize the current screen')).resolves.toBe(
      false,
    );

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        textSessionLifecycle: expect.objectContaining({ status: 'error' }),
        backendState: 'failed',
        lastRuntimeError: 'Backend health check failed',
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
      startTextChatStream: createTextChatHarness().startTextChatStream,
      requestSessionToken: vi.fn().mockRejectedValue(new Error('token failed')),
      createTransport: vi.fn(() => createUnusedTransport()),
    });

    await controller.startSession({ mode: 'voice' });

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        currentMode: 'text',
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
      startTextChatStream: createTextChatHarness().startTextChatStream,
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
        currentMode: 'text',
        speechLifecycle: expect.objectContaining({
          status: 'off',
        }),
        voiceSessionStatus: 'disconnected',
        lastRuntimeError: 'Invalid Live config: VITE_LIVE_MODEL is required for speech mode',
      }),
    );
  });

  it('cancels an active text stream when the session ends', async () => {
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

    await controller.submitTextTurn('Summarize the current screen');
    await controller.endSession();

    expect(textChat.cancel).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
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
      startTextChatStream: createTextChatHarness().startTextChatStream,
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
