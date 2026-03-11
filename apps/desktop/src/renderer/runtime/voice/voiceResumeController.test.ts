import { describe, expect, it, vi } from 'vitest';
import { createVoiceResumeController } from './voiceResumeController';

const VALID_TOKEN = {
  token: 'auth_tokens/test-token',
  expireTime: '2099-01-01T00:00:00.000Z',
  newSessionExpireTime: '2099-01-01T00:00:00.000Z',
};

function createMockOps() {
  const storeState = {
    voiceSessionResumption: {
      status: 'goAway',
      latestHandle: 'handles/v2',
      resumable: true,
      lastDetail: 'server draining',
    },
    voiceSessionDurability: { lastDetail: null },
    setLastRuntimeError: vi.fn(),
    setActiveTransport: vi.fn(),
  };

  const transport = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    kind: 'gemini-live',
  };

  return {
    store: { getState: vi.fn().mockReturnValue(storeState) } as never,
    createTransport: vi.fn().mockReturnValue(transport),
    getToken: vi.fn().mockReturnValue(VALID_TOKEN),
    beginSessionOperation: vi.fn().mockReturnValue(1),
    isCurrentSessionOperation: vi.fn().mockReturnValue(true),
    setVoiceSessionStatus: vi.fn(),
    setVoiceSessionResumption: vi.fn(),
    setVoiceSessionDurability: vi.fn(),
    setVoiceErrorState: vi.fn(),
    setVoiceResumptionInFlight: vi.fn(),
    refreshToken: vi.fn().mockResolvedValue(VALID_TOKEN),
    stopVoicePlayback: vi.fn().mockResolvedValue(undefined),
    subscribeTransport: vi.fn(),
    handleTransportEvent: vi.fn(),
    getActiveTransport: vi.fn().mockReturnValue(null),
    setActiveTransport: vi.fn(),
    unsubscribePreviousTransport: vi.fn(),
    resetTransportDeps: vi.fn(),
    _storeState: storeState,
    _transport: transport,
  };
}

describe('createVoiceResumeController', () => {
  it('rejects early when no resume handle is available', async () => {
    const ops = createMockOps();
    ops._storeState.voiceSessionResumption.latestHandle = null;
    const { resume } = createVoiceResumeController(ops as never);

    await resume('server draining');

    expect(ops.setVoiceSessionResumption).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'resumeFailed' }),
    );
    expect(ops.setVoiceErrorState).toHaveBeenCalledWith('server draining');
    expect(ops.createTransport).not.toHaveBeenCalled();
  });

  it('rejects early when session is not resumable', async () => {
    const ops = createMockOps();
    ops._storeState.voiceSessionResumption.resumable = false;
    const { resume } = createVoiceResumeController(ops as never);

    await resume('detail');

    expect(ops.setVoiceErrorState).toHaveBeenCalledWith('detail');
    expect(ops.createTransport).not.toHaveBeenCalled();
  });

  it('sets up recovery state before connecting', async () => {
    const ops = createMockOps();
    const { resume } = createVoiceResumeController(ops as never);

    await resume('server draining');

    expect(ops.setVoiceResumptionInFlight).toHaveBeenCalledWith(true);
    expect(ops.setVoiceSessionStatus).toHaveBeenCalledWith('recovering');
    expect(ops.setVoiceSessionResumption).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'reconnecting' }),
    );
  });

  it('tears down previous transport before creating new one', async () => {
    const oldTransport = { disconnect: vi.fn().mockResolvedValue(undefined) };
    const ops = createMockOps();
    ops.getActiveTransport.mockReturnValue(oldTransport);
    const { resume } = createVoiceResumeController(ops as never);

    await resume('detail');

    expect(ops.unsubscribePreviousTransport).toHaveBeenCalledTimes(1);
    expect(ops.resetTransportDeps).toHaveBeenCalledTimes(1);
    expect(ops.stopVoicePlayback).toHaveBeenCalledTimes(1);
  });

  it('creates new transport and connects with valid token and resume handle', async () => {
    const ops = createMockOps();
    const { resume } = createVoiceResumeController(ops as never);

    await resume('server draining');

    expect(ops.createTransport).toHaveBeenCalledWith('gemini-live');
    expect(ops.subscribeTransport).toHaveBeenCalledWith(
      ops._transport,
      ops.handleTransportEvent,
    );
    expect(ops._transport.connect).toHaveBeenCalledWith({
      token: VALID_TOKEN,
      mode: 'voice',
      resumeHandle: 'handles/v2',
    });
  });

  it('skips token refresh when existing token is valid', async () => {
    const ops = createMockOps();
    const { resume } = createVoiceResumeController(ops as never);

    await resume('detail');

    expect(ops.refreshToken).not.toHaveBeenCalled();
  });

  it('refreshes token when existing token is near expiry', async () => {
    const nearExpiryToken = {
      token: 'auth_tokens/near-expiry',
      expireTime: '2000-01-01T00:00:00.000Z',
      newSessionExpireTime: '2000-01-01T00:00:00.000Z',
    };
    const ops = createMockOps();
    ops.getToken.mockReturnValue(nearExpiryToken);
    ops.refreshToken.mockResolvedValue(VALID_TOKEN);
    const { resume } = createVoiceResumeController(ops as never);

    await resume('detail');

    expect(ops.refreshToken).toHaveBeenCalledWith(1, 'detail');
    expect(ops._transport.connect).toHaveBeenCalledWith(
      expect.objectContaining({ token: VALID_TOKEN }),
    );
  });

  it('sets resumeFailed and error state when token refresh fails', async () => {
    const ops = createMockOps();
    ops.getToken.mockReturnValue({
      token: 'auth_tokens/expired',
      expireTime: '2000-01-01T00:00:00.000Z',
      newSessionExpireTime: '2000-01-01T00:00:00.000Z',
    });
    ops.refreshToken.mockResolvedValue(null);
    ops._storeState.voiceSessionDurability.lastDetail = 'token refresh failed';
    const { resume } = createVoiceResumeController(ops as never);

    await resume('detail');

    expect(ops.setVoiceSessionResumption).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'resumeFailed' }),
    );
    expect(ops.setVoiceResumptionInFlight).toHaveBeenCalledWith(false);
    expect(ops.setVoiceErrorState).toHaveBeenCalled();
    expect(ops.createTransport).not.toHaveBeenCalled();
  });

  it('aborts silently when operation is cancelled during token refresh', async () => {
    const ops = createMockOps();
    ops.getToken.mockReturnValue({
      token: 'auth_tokens/expired',
      expireTime: '2000-01-01T00:00:00.000Z',
      newSessionExpireTime: '2000-01-01T00:00:00.000Z',
    });
    ops.refreshToken.mockResolvedValue(VALID_TOKEN);
    ops.isCurrentSessionOperation.mockReturnValue(false);
    const { resume } = createVoiceResumeController(ops as never);

    await resume('detail');

    expect(ops.setVoiceErrorState).not.toHaveBeenCalled();
    expect(ops.createTransport).not.toHaveBeenCalled();
  });

  it('sets error state when connect throws', async () => {
    const ops = createMockOps();
    ops._transport.connect.mockRejectedValue(new Error('resume rejected'));
    const { resume } = createVoiceResumeController(ops as never);

    await resume('detail');

    expect(ops.setVoiceSessionResumption).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'resumeFailed',
        lastDetail: 'resume rejected',
      }),
    );
    expect(ops.setVoiceResumptionInFlight).toHaveBeenCalledWith(false);
    expect(ops.setVoiceErrorState).toHaveBeenCalledWith('resume rejected');
  });

  it('disconnects and aborts when operation cancelled after connect', async () => {
    const ops = createMockOps();
    // isCurrentSessionOperation is only checked after connect resolves
    ops.isCurrentSessionOperation.mockReturnValue(false);
    const { resume } = createVoiceResumeController(ops as never);

    await resume('detail');

    expect(ops._transport.disconnect).toHaveBeenCalledTimes(1);
    expect(ops.setVoiceErrorState).not.toHaveBeenCalled();
  });

  it('ignores playback stop errors during teardown', async () => {
    const ops = createMockOps();
    ops.stopVoicePlayback.mockRejectedValue(new Error('playback error'));
    const { resume } = createVoiceResumeController(ops as never);

    // Should not throw
    await resume('detail');

    expect(ops.createTransport).toHaveBeenCalledTimes(1);
  });
});
