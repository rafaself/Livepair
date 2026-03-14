import { describe, expect, it, vi } from 'vitest';
import { createSessionControllerEndings } from './sessionEndings';

function createMockArgs() {
  return {
    beginSessionOperation: vi.fn(() => 1),
    recordSessionEvent: vi.fn(),
    teardownActiveRuntime: vi.fn().mockResolvedValue(undefined),
    endLiveSession: vi.fn().mockResolvedValue(undefined),
    setCurrentMode: vi.fn(),
  };
}

describe('createSessionControllerEndings', () => {
  it('ends the session with the requested preservation flags and events', async () => {
    const args = createMockArgs();
    const { endSessionInternal } = createSessionControllerEndings(args);

    await endSessionInternal({
      preserveLastRuntimeError: 'kept error',
      preserveVoiceRuntimeDiagnostics: true,
      recordEvents: true,
      liveSessionEnd: {
        status: 'failed',
        endedReason: 'kept error',
      },
    });

    expect(args.beginSessionOperation).toHaveBeenCalledTimes(1);
    expect(args.recordSessionEvent).toHaveBeenNthCalledWith(1, {
      type: 'session.end.requested',
    });
    expect(args.teardownActiveRuntime).toHaveBeenCalledWith({
      textSessionStatus: 'disconnected',
      preserveLastRuntimeError: 'kept error',
      preserveVoiceRuntimeDiagnostics: true,
    });
    expect(args.endLiveSession).toHaveBeenCalledWith({
      status: 'failed',
      endedReason: 'kept error',
    });
    expect(args.setCurrentMode).toHaveBeenCalledWith('inactive');
    expect(args.recordSessionEvent).toHaveBeenNthCalledWith(2, {
      type: 'session.ended',
    });
  });

  it('ends speech mode while preserving conversation turns', async () => {
    const args = createMockArgs();
    const { endSpeechModeInternal } = createSessionControllerEndings(args);

    await endSpeechModeInternal({ recordEvents: true });

    expect(args.beginSessionOperation).toHaveBeenCalledTimes(1);
    expect(args.recordSessionEvent).toHaveBeenNthCalledWith(1, {
      type: 'session.end.requested',
    });
    expect(args.teardownActiveRuntime).toHaveBeenCalledWith({
      textSessionStatus: 'disconnected',
      preserveConversationTurns: true,
    });
    expect(args.endLiveSession).toHaveBeenCalledWith({
      status: 'ended',
      endedReason: null,
    });
    expect(args.setCurrentMode).toHaveBeenCalledWith('inactive');
    expect(args.recordSessionEvent).toHaveBeenNthCalledWith(2, {
      type: 'session.ended',
    });
  });
});
