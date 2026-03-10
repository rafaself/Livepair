import { beforeEach, describe, expect, it } from 'vitest';
import { selectAssistantRuntimeState } from '../runtime/selectors';
import { useSessionStore } from './sessionStore';

describe('sessionStore', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  it('tracks runtime session fields independently and derives the UI assistant state', () => {
    useSessionStore.getState().setSessionPhase('active');
    useSessionStore.getState().setAssistantActivity('listening');
    useSessionStore.getState().setBackendState('checking');
    useSessionStore.getState().setTokenRequestState('loading');
    useSessionStore.getState().setTransportState('connecting');
    useSessionStore.getState().setActiveTransport('gemini-live');

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        sessionPhase: 'active',
        assistantActivity: 'listening',
        backendState: 'checking',
        tokenRequestState: 'loading',
        transportState: 'connecting',
        activeTransport: 'gemini-live',
      }),
    );
    expect(selectAssistantRuntimeState(useSessionStore.getState())).toBe('listening');
  });

  it('resets all runtime state back to its defaults', () => {
    useSessionStore.getState().setSessionPhase('error');
    useSessionStore.getState().setAssistantActivity('speaking');
    useSessionStore.getState().setBackendState('failed');
    useSessionStore.getState().setTokenRequestState('success');
    useSessionStore.getState().setTransportState('connected');
    useSessionStore.getState().setActiveTransport('gemini-live');

    useSessionStore.getState().reset();

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        sessionPhase: 'idle',
        assistantActivity: 'idle',
        backendState: 'idle',
        tokenRequestState: 'idle',
        transportState: 'idle',
        activeTransport: null,
        conversationTurns: [],
        lastRuntimeError: null,
      }),
    );
    expect(selectAssistantRuntimeState(useSessionStore.getState())).toBe('disconnected');
  });
});
