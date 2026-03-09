import { beforeEach, describe, expect, it } from 'vitest';
import { useSessionStore } from './sessionStore';

describe('sessionStore', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  it('tracks assistant, backend, and token request state independently', () => {
    useSessionStore.getState().setAssistantState('listening');
    useSessionStore.getState().setBackendState('checking');
    useSessionStore.getState().setTokenRequestState('loading');

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        assistantState: 'listening',
        backendState: 'checking',
        tokenRequestState: 'loading',
      }),
    );
  });

  it('resets all session state back to its defaults', () => {
    useSessionStore.getState().setAssistantState('error');
    useSessionStore.getState().setBackendState('failed');
    useSessionStore.getState().setTokenRequestState('success');

    useSessionStore.getState().reset();

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        assistantState: 'disconnected',
        backendState: 'idle',
        tokenRequestState: 'idle',
      }),
    );
  });
});
