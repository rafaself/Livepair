import { describe, expect, it, vi } from 'vitest';
import { createVoiceTokenManager } from './voiceTokenManager';
import type { CreateEphemeralTokenResponse } from '@livepair/shared-types';

function createHarness() {
  const setTokenRequestState = vi.fn();
  const setBackendState = vi.fn();
  const store = {
    getState: () => ({ setTokenRequestState, setBackendState }),
  };

  const mockToken: CreateEphemeralTokenResponse = {
    token: 'test-token',
    expireTime: new Date(Date.now() + 600_000).toISOString(),
    newSessionExpireTime: new Date(Date.now() + 300_000).toISOString(),
  };

  const requestSessionToken = vi.fn(() => Promise.resolve(mockToken));
  let currentOperationId = 1;
  const isCurrentSessionOperation = vi.fn((id: number) => id === currentOperationId);
  const setVoiceSessionDurability = vi.fn();
  const recordSessionEvent = vi.fn();
  const onError = vi.fn();

  const mgr = createVoiceTokenManager(
    store,
    requestSessionToken,
    isCurrentSessionOperation,
    setVoiceSessionDurability,
    recordSessionEvent,
    onError,
    'gemini-live',
  );

  return {
    mgr,
    store: { setTokenRequestState, setBackendState },
    requestSessionToken,
    isCurrentSessionOperation,
    setVoiceSessionDurability,
    recordSessionEvent,
    onError,
    mockToken,
    invalidateOperation: () => { currentOperationId += 1; },
  };
}

describe('createVoiceTokenManager', () => {
  it('get returns null initially', () => {
    const { mgr } = createHarness();
    expect(mgr.get()).toBeNull();
  });

  it('set stores token', () => {
    const { mgr, mockToken } = createHarness();
    mgr.set(mockToken);
    expect(mgr.get()).toBe(mockToken);
  });

  it('clear nullifies token', () => {
    const { mgr, mockToken } = createHarness();
    mgr.set(mockToken);
    mgr.clear();
    expect(mgr.get()).toBeNull();
  });

  it('request sets loading state and records start event', async () => {
    const { mgr, store, recordSessionEvent } = createHarness();

    await mgr.request(1);

    expect(store.setTokenRequestState).toHaveBeenCalledWith('loading');
    expect(recordSessionEvent).toHaveBeenCalledWith({
      type: 'session.token.request.started',
    });
  });

  it('request on success stores token and updates state', async () => {
    const { mgr, store, recordSessionEvent, mockToken } = createHarness();

    const token = await mgr.request(1);

    expect(token).toBe(mockToken);
    expect(mgr.get()).toBe(mockToken);
    expect(store.setTokenRequestState).toHaveBeenCalledWith('success');
    expect(store.setBackendState).toHaveBeenCalledWith('connected');
    expect(recordSessionEvent).toHaveBeenCalledWith({
      type: 'session.token.request.succeeded',
      transport: 'gemini-live',
    });
  });

  it('request syncs durability state on success', async () => {
    const { mgr, setVoiceSessionDurability, mockToken } = createHarness();

    await mgr.request(1);

    expect(setVoiceSessionDurability).toHaveBeenCalledWith(
      expect.objectContaining({
        compressionEnabled: true,
        tokenValid: true,
        tokenRefreshing: false,
        tokenRefreshFailed: false,
        expireTime: mockToken.expireTime,
        newSessionExpireTime: mockToken.newSessionExpireTime,
      }),
    );
  });

  it('request returns null on stale operation', async () => {
    const { mgr, invalidateOperation, requestSessionToken, mockToken } = createHarness();

    requestSessionToken.mockImplementation(async () => {
      invalidateOperation();
      return mockToken;
    });

    const result = await mgr.request(1);
    expect(result).toBeNull();
  });

  it('request on failure sets error state and calls onError', async () => {
    const { mgr, store, requestSessionToken, onError, setVoiceSessionDurability } = createHarness();
    requestSessionToken.mockRejectedValue(new Error('network error'));

    await mgr.request(1);

    expect(store.setTokenRequestState).toHaveBeenCalledWith('error');
    expect(store.setBackendState).toHaveBeenCalledWith('failed');
    expect(setVoiceSessionDurability).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenValid: false,
        tokenRefreshFailed: true,
      }),
    );
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('network error'));
  });

  it('request on failure with stale operation does not call onError', async () => {
    const { mgr, invalidateOperation, requestSessionToken, onError } = createHarness();
    requestSessionToken.mockImplementation(async () => {
      invalidateOperation();
      throw new Error('network error');
    });

    await mgr.request(1);

    expect(onError).not.toHaveBeenCalled();
  });

  it('refresh sets tokenRefreshing durability state', async () => {
    const { mgr, setVoiceSessionDurability } = createHarness();

    await mgr.refresh(1, 'connection lost');

    expect(setVoiceSessionDurability).toHaveBeenCalledWith({
      tokenRefreshing: true,
      tokenRefreshFailed: false,
      lastDetail: 'connection lost',
    });
  });

  it('refresh stores new token on success', async () => {
    const { mgr, mockToken } = createHarness();

    const token = await mgr.refresh(1, 'refreshing');

    expect(token).toBe(mockToken);
    expect(mgr.get()).toBe(mockToken);
  });

  it('refresh syncs durability with detail on success', async () => {
    const { mgr, setVoiceSessionDurability } = createHarness();

    await mgr.refresh(1, 'reconnecting');

    expect(setVoiceSessionDurability).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenRefreshing: false,
        lastDetail: 'reconnecting',
      }),
    );
  });

  it('refresh returns null on failure without calling onError', async () => {
    const { mgr, requestSessionToken, onError, setVoiceSessionDurability } = createHarness();
    requestSessionToken.mockRejectedValue(new Error('refresh failed'));

    const result = await mgr.refresh(1, 'reconnecting');

    expect(result).toBeNull();
    expect(onError).not.toHaveBeenCalled();
    expect(setVoiceSessionDurability).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenValid: false,
        tokenRefreshFailed: true,
      }),
    );
  });

  it('refresh returns null on stale operation', async () => {
    const { mgr, invalidateOperation, requestSessionToken, mockToken } = createHarness();

    requestSessionToken.mockImplementation(async () => {
      invalidateOperation();
      return mockToken;
    });

    const result = await mgr.refresh(1, 'detail');
    expect(result).toBeNull();
  });

  it('syncDurabilityState merges patch with defaults', () => {
    const { mgr, setVoiceSessionDurability, mockToken } = createHarness();

    mgr.syncDurabilityState(mockToken, { lastDetail: 'custom' });

    expect(setVoiceSessionDurability).toHaveBeenCalledWith(
      expect.objectContaining({
        compressionEnabled: true,
        tokenValid: true,
        lastDetail: 'custom',
      }),
    );
  });

  it('syncDurabilityState with null token sets tokenValid false', () => {
    const { mgr, setVoiceSessionDurability } = createHarness();

    mgr.syncDurabilityState(null);

    expect(setVoiceSessionDurability).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenValid: false,
        expireTime: null,
        newSessionExpireTime: null,
      }),
    );
  });
});
