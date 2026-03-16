import { describe, expect, it, vi } from 'vitest';
import { createSessionVoiceConnection } from './sessionVoiceConnection';

function createMockArgs() {
  const setLastRuntimeError = vi.fn();
  const setVoiceSessionResumption = vi.fn();

    return {
      store: {
        getState: vi.fn(() => ({
          setLastRuntimeError,
          setVoiceSessionResumption,
        })),
      } as never,
      isCurrentSessionOperation: vi.fn(() => true),
      applySpeechLifecycleEvent: vi.fn(),
      setVoiceResumptionInFlight: vi.fn(),
      resolveSessionVoice: vi.fn().mockResolvedValue('Kore'),
      createTransport: vi.fn(),
      activateVoiceTransport: vi.fn(),
      buildRehydrationPacketFromCurrentChat: vi.fn(),
      invalidatePersistedLiveSession: vi.fn().mockResolvedValue(undefined),
      createPersistedLiveSession: vi.fn().mockResolvedValue(undefined),
      endPersistedLiveSession: vi.fn().mockResolvedValue(undefined),
      logRuntimeDiagnostic: vi.fn(),
      _storeState: {
        setLastRuntimeError,
        setVoiceSessionResumption,
      },
    };
}

describe('createSessionVoiceConnection', () => {
  it('invalidates a persisted session without a resume handle before attempting transport setup', async () => {
    const args = createMockArgs();
    const connection = createSessionVoiceConnection(args);

    await expect(
      connection.connectRestoredSession(
        1,
        { client_secret: { value: 'token' } } as never,
        {
          id: 'live-1',
          restorable: true,
          voice: 'Puck',
          resumptionHandle: null,
          invalidationReason: null,
        } as never,
      ),
    ).resolves.toEqual({
      status: 'failed',
      detail: 'Persisted Live session is missing a resume handle',
    });

    expect(args.invalidatePersistedLiveSession).toHaveBeenCalledWith({
      restorable: false,
      invalidatedAt: expect.any(String),
      invalidationReason: 'Persisted Live session is missing a resume handle',
    });
    expect(args.endPersistedLiveSession).toHaveBeenCalledWith({
      status: 'failed',
      endedReason: 'Persisted Live session is missing a resume handle',
    });
    expect(args.createTransport).not.toHaveBeenCalled();
  });

  it('activates the restored transport and marks the session ready when resume succeeds', async () => {
    const args = createMockArgs();
    const transport = {
      connect: vi.fn().mockResolvedValue(undefined),
    };
    args.createTransport.mockReturnValue(transport);
    const connection = createSessionVoiceConnection(args);
    const token = { client_secret: { value: 'token' } } as never;

    await expect(
      connection.connectRestoredSession(
        7,
        token,
        {
          id: 'live-2',
          restorable: true,
          voice: 'Aoede',
          resumptionHandle: 'resume-handle',
          invalidationReason: null,
        } as never,
      ),
    ).resolves.toEqual({ status: 'resumed' });

    expect(args._storeState.setLastRuntimeError).toHaveBeenCalledWith(null);
    expect(args._storeState.setVoiceSessionResumption).toHaveBeenCalledWith({
      status: 'reconnecting',
      latestHandle: 'resume-handle',
      resumable: true,
      lastDetail: 'Restoring persisted Live session',
    });
    expect(args.setVoiceResumptionInFlight).toHaveBeenCalledWith(true);
    expect(args.createTransport).toHaveBeenCalledWith({ voice: 'Aoede' });
    expect(args.activateVoiceTransport).toHaveBeenCalledWith(transport);
    expect(transport.connect).toHaveBeenCalledWith({
      token,
      mode: 'voice',
      resumeHandle: 'resume-handle',
    });
    expect(args.applySpeechLifecycleEvent).toHaveBeenCalledWith({ type: 'session.ready' });
  });

  it('persists a fresh live session only after fallback connect succeeds', async () => {
    const args = createMockArgs();
    const transport = {
      connect: vi.fn().mockResolvedValue(undefined),
    };
    args.createTransport.mockReturnValue(transport);
    args.buildRehydrationPacketFromCurrentChat.mockResolvedValue({});
    const connection = createSessionVoiceConnection(args);
    const token = { client_secret: { value: 'token' } } as never;

    await expect(
      connection.connectFallbackSession(9, token, 'no-restore-candidate'),
    ).resolves.toEqual({ status: 'connected' });

    expect(args.resolveSessionVoice).toHaveBeenCalledTimes(1);
    expect(args.createTransport).toHaveBeenCalledWith({ voice: 'Kore' });
    expect(args.activateVoiceTransport).toHaveBeenCalledWith(transport);
    expect(transport.connect).toHaveBeenCalledWith({
      token,
      mode: 'voice',
      rehydrationPacket: {},
    });
    expect(args.createPersistedLiveSession).toHaveBeenCalledWith('Kore');
    expect(transport.connect.mock.invocationCallOrder[0]).toBeLessThan(
      args.createPersistedLiveSession.mock.invocationCallOrder[0]!,
    );
    expect(args.applySpeechLifecycleEvent).toHaveBeenCalledWith({ type: 'session.ready' });
  });

  it('does not persist a fresh live session when fallback connect fails', async () => {
    const args = createMockArgs();
    const transport = {
      connect: vi.fn().mockRejectedValue(new Error('connect failed')),
      disconnect: vi.fn().mockResolvedValue(undefined),
    };
    args.createTransport.mockReturnValue(transport);
    args.buildRehydrationPacketFromCurrentChat.mockResolvedValue({});
    const connection = createSessionVoiceConnection(args);
    const token = { client_secret: { value: 'token' } } as never;

    await expect(
      connection.connectFallbackSession(11, token, 'no-restore-candidate'),
    ).resolves.toEqual({
      status: 'failed',
      detail: 'connect failed',
    });

    expect(args.resolveSessionVoice).toHaveBeenCalledTimes(1);
    expect(args.createPersistedLiveSession).not.toHaveBeenCalled();
    expect(args.applySpeechLifecycleEvent).not.toHaveBeenCalled();
  });

  it('disconnects the fallback transport when persisting the fresh live session fails', async () => {
    const args = createMockArgs();
    const transport = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
    };
    args.createTransport.mockReturnValue(transport);
    args.buildRehydrationPacketFromCurrentChat.mockResolvedValue({});
    args.createPersistedLiveSession.mockRejectedValue(new Error('persist failed'));
    const connection = createSessionVoiceConnection(args);
    const token = { client_secret: { value: 'token' } } as never;

    await expect(
      connection.connectFallbackSession(13, token, 'no-restore-candidate'),
    ).resolves.toEqual({
      status: 'failed',
      detail: 'persist failed',
    });

    expect(args.createPersistedLiveSession).toHaveBeenCalledWith('Kore');
    expect(transport.disconnect).toHaveBeenCalledTimes(1);
    expect(args.applySpeechLifecycleEvent).not.toHaveBeenCalled();
  });

  it('disconnects the fallback transport when a newer operation supersedes the connect', async () => {
    const args = createMockArgs();
    args.isCurrentSessionOperation
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    const transport = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
    };
    args.createTransport.mockReturnValue(transport);
    args.buildRehydrationPacketFromCurrentChat.mockResolvedValue({});
    const connection = createSessionVoiceConnection(args);
    const token = { client_secret: { value: 'token' } } as never;

    await expect(
      connection.connectFallbackSession(15, token, 'no-restore-candidate'),
    ).resolves.toEqual({
      status: 'failed',
      detail: 'Voice session fallback was superseded',
    });

    expect(args.createPersistedLiveSession).not.toHaveBeenCalled();
    expect(transport.disconnect).toHaveBeenCalledTimes(1);
    expect(args.applySpeechLifecycleEvent).not.toHaveBeenCalled();
  });
});
