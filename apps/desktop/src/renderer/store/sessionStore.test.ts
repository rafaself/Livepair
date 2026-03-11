import { beforeEach, describe, expect, it } from 'vitest';
import { selectAssistantRuntimeState } from '../runtime/selectors';
import { useSessionStore } from './sessionStore';

describe('sessionStore', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  it('tracks lifecycle state centrally and derives the UI assistant state from it', () => {
    useSessionStore.getState().setTextSessionLifecycle({ status: 'receiving' });
    useSessionStore.getState().setAssistantActivity('listening');
    useSessionStore.getState().setBackendState('checking');
    useSessionStore.getState().setTokenRequestState('loading');
    useSessionStore.getState().setActiveTransport('gemini-live');

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        textSessionLifecycle: expect.objectContaining({
          status: 'receiving',
        }),
        assistantActivity: 'listening',
        backendState: 'checking',
        tokenRequestState: 'loading',
        activeTransport: 'gemini-live',
      }),
    );
    expect(selectAssistantRuntimeState(useSessionStore.getState())).toBe('listening');
  });

  it('resets all runtime state back to its defaults', () => {
    useSessionStore.getState().setTextSessionLifecycle({ status: 'error' });
    useSessionStore.getState().setAssistantActivity('speaking');
    useSessionStore.getState().setBackendState('failed');
    useSessionStore.getState().setTokenRequestState('success');
    useSessionStore.getState().setActiveTransport('gemini-live');

    useSessionStore.getState().reset();

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        textSessionLifecycle: expect.objectContaining({
          status: 'idle',
        }),
        assistantActivity: 'idle',
        backendState: 'idle',
        tokenRequestState: 'idle',
        activeTransport: null,
        conversationTurns: [],
        lastRuntimeError: null,
      }),
    );
    expect(selectAssistantRuntimeState(useSessionStore.getState())).toBe('disconnected');
  });

  it('tracks voice resumption and durability state separately', () => {
    useSessionStore.getState().setVoiceSessionResumption({
      status: 'reconnecting',
      latestHandle: 'handles/voice-session-2',
      resumable: true,
      lastDetail: 'server draining',
    });
    useSessionStore.getState().setVoiceSessionDurability({
      compressionEnabled: true,
      tokenValid: false,
      tokenRefreshing: true,
      tokenRefreshFailed: false,
      expireTime: '2099-03-09T12:30:00.000Z',
      newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      lastDetail: 'Refreshing token before resume',
    });

    expect(useSessionStore.getState().voiceSessionResumption).toEqual({
      status: 'reconnecting',
      latestHandle: 'handles/voice-session-2',
      resumable: true,
      lastDetail: 'server draining',
    });
    expect(useSessionStore.getState().voiceSessionDurability).toEqual({
      compressionEnabled: true,
      tokenValid: false,
      tokenRefreshing: true,
      tokenRefreshFailed: false,
      expireTime: '2099-03-09T12:30:00.000Z',
      newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      lastDetail: 'Refreshing token before resume',
    });
  });
});
