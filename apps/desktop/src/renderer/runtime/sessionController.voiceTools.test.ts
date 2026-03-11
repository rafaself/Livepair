import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDesktopSessionController } from './sessionController';
import { useSessionStore } from '../store/sessionStore';
import { useSettingsStore } from '../store/settingsStore';
import { DEFAULT_DESKTOP_SETTINGS } from '../../shared/settings';
import {
  createVoiceTransportHarness,
  createTextChatHarness,
} from './sessionController.testUtils';

describe('createDesktopSessionController – voice tools', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
    useSettingsStore.setState({
      settings: DEFAULT_DESKTOP_SETTINGS,
      isReady: true,
    });
  });

  it('executes local voice tools and responds without breaking the session', async () => {
    const voiceTransport = createVoiceTransportHarness();
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
      createTransport: vi.fn(() => voiceTransport.transport),
    });

    await controller.startSession({ mode: 'voice' });

    voiceTransport.emit({
      type: 'tool-call',
      calls: [
        {
          id: 'call-1',
          name: 'get_current_mode',
          arguments: {},
        },
      ],
    });

    await vi.waitFor(() => {
      expect(voiceTransport.sendToolResponses).toHaveBeenCalledWith([
        {
          id: 'call-1',
          name: 'get_current_mode',
          response: {
            ok: true,
            mode: 'speech',
          },
        },
      ]);
    });

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        voiceSessionStatus: 'ready',
        voiceToolState: {
          status: 'idle',
          toolName: 'get_current_mode',
          callId: 'call-1',
          lastError: null,
        },
      }),
    );
  });

  it('surfaces local tool failures without crashing the voice session', async () => {
    const voiceTransport = createVoiceTransportHarness();
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
      createTransport: vi.fn(() => voiceTransport.transport),
    });

    await controller.startSession({ mode: 'voice' });

    voiceTransport.emit({
      type: 'tool-call',
      calls: [
        {
          id: 'call-2',
          name: 'unknown_tool',
          arguments: {},
        },
      ],
    });

    await vi.waitFor(() => {
      expect(voiceTransport.sendToolResponses).toHaveBeenCalledWith([
        {
          id: 'call-2',
          name: 'unknown_tool',
          response: {
            ok: false,
            error: {
              code: 'tool_not_supported',
              message: 'Tool "unknown_tool" is not supported in voice mode',
            },
          },
        },
      ]);
    });

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        voiceSessionStatus: 'ready',
        voiceToolState: {
          status: 'toolError',
          toolName: 'unknown_tool',
          callId: 'call-2',
          lastError: 'Tool "unknown_tool" is not supported in voice mode',
        },
      }),
    );
  });
});
