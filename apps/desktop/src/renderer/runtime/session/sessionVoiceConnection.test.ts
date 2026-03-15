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
    expect(args.activateVoiceTransport).toHaveBeenCalledWith(transport);
    expect(transport.connect).toHaveBeenCalledWith({
      token,
      mode: 'voice',
      resumeHandle: 'resume-handle',
    });
    expect(args.applySpeechLifecycleEvent).toHaveBeenCalledWith({ type: 'session.ready' });
  });
});
