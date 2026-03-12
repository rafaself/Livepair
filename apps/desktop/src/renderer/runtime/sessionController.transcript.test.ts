import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDesktopSessionController } from './sessionController';
import { useSessionStore } from '../store/sessionStore';
import { useSettingsStore } from '../store/settingsStore';
import { DEFAULT_DESKTOP_SETTINGS } from '../../shared/settings';
import {
  createVoiceTransportHarness,
  createVoicePlaybackHarness,
  createTextChatHarness,
} from './sessionController.testUtils';

describe('createDesktopSessionController – transcript', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
    useSettingsStore.setState({
      settings: DEFAULT_DESKTOP_SETTINGS,
      isReady: true,
    });
  });

  it('stores live voice transcripts separately from conversation history and rolls them on the next user turn', async () => {
    const voiceTransport = createVoiceTransportHarness();
    const voicePlayback = createVoicePlaybackHarness();
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
            role: 'assistant',
            content: 'Hi',
            state: 'complete',
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
        role: 'assistant',
        content: 'Hi',
        state: 'complete',
      }),
    ]);
  });

  it('promotes finalized assistant speech transcript into a durable assistant turn only when the turn completes', async () => {
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
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });

    voiceTransport.emit({ type: 'output-transcript', text: 'Hi' });
    voiceTransport.emit({ type: 'output-transcript', text: 'Hi there' });

    expect(useSessionStore.getState().conversationTurns).toEqual([]);
    expect(useSessionStore.getState().currentVoiceTranscript.assistant.text).toBe('Hi there');

    voiceTransport.emit({ type: 'turn-complete' });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: 'Hi there',
        state: 'complete',
      }),
    ]);
  });

  it('does not promote user speech into conversation history when a voice turn settles without assistant transcript', async () => {
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
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });

    voiceTransport.emit({ type: 'input-transcript', text: 'Only the user spoke' });
    voiceTransport.emit({ type: 'turn-complete' });

    expect(useSessionStore.getState().conversationTurns).toEqual([]);
    expect(useSessionStore.getState().currentVoiceTranscript).toEqual({
      user: {
        text: 'Only the user spoke',
      },
      assistant: {
        text: '',
      },
    });
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
      startTextChatStream: createTextChatHarness().startTextChatStream,
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
        role: 'assistant',
        content: 'Partial answer',
        state: 'complete',
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

  it('does not duplicate the promoted assistant turn when turn-complete arrives after interruption', async () => {
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
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });

    voiceTransport.emit({ type: 'output-transcript', text: 'Interrupted answer' });
    voiceTransport.emit({ type: 'interrupted' });
    voiceTransport.emit({ type: 'turn-complete' });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: 'Interrupted answer',
        state: 'complete',
        statusLabel: 'Interrupted',
      }),
    ]);
  });

  it('normalizes corrective transcript updates and clears voice transcripts on session end', async () => {
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
      settingsStore: useSettingsStore,
    });

    await controller.startSession({ mode: 'voice' });

    voiceTransport.emit({ type: 'input-transcript', text: 'Hello' });
    voiceTransport.emit({ type: 'input-transcript', text: 'Hello there' });
    voiceTransport.emit({ type: 'input-transcript', text: 'Hello there again' });
    voiceTransport.emit({ type: 'output-transcript', text: 'Hi' });
    voiceTransport.emit({ type: 'output-transcript', text: ' there' });
    voiceTransport.emit({ type: 'output-transcript', text: 'Hi there, corrected' });

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
});
