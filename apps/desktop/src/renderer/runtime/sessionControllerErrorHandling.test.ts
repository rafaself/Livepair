import { describe, expect, it, vi } from 'vitest';
import { createSessionControllerErrorHandling } from './sessionControllerErrorHandling';

function createMockArgs() {
  return {
    clearToken: vi.fn(),
    cleanupTransport: vi.fn(),
    endSessionInternal: vi.fn().mockResolvedValue(undefined),
    logRuntimeError: vi.fn(),
    resetVoiceTurnTranscriptState: vi.fn(),
    setLastRuntimeError: vi.fn(),
    setAssistantActivity: vi.fn(),
    setActiveTransport: vi.fn(),
    setCurrentMode: vi.fn(),
    setVoiceResumptionInFlight: vi.fn(),
    getVoiceSessionResumptionStatus: vi.fn().mockReturnValue('idle'),
    setVoiceSessionResumption: vi.fn(),
    setVoiceSessionStatus: vi.fn(),
    setVoiceToolState: vi.fn(),
    textRuntimeFailed: vi.fn(),
    failPendingAssistantTurn: vi.fn(),
  };
}

describe('createSessionControllerErrorHandling', () => {
  describe('setErrorState', () => {
    it('calls textRuntimeFailed, logs, fails pending turn, cleans up transport, and sets error', () => {
      const args = createMockArgs();
      const { setErrorState } = createSessionControllerErrorHandling(args);

      setErrorState('connection lost');

      expect(args.textRuntimeFailed).toHaveBeenCalledTimes(1);
      expect(args.logRuntimeError).toHaveBeenCalledWith(
        'session',
        'runtime entered error state',
        { detail: 'connection lost' },
      );
      expect(args.failPendingAssistantTurn).toHaveBeenCalledWith('Disconnected');
      expect(args.cleanupTransport).toHaveBeenCalledTimes(1);
      expect(args.setAssistantActivity).toHaveBeenCalledWith('idle');
      expect(args.setActiveTransport).toHaveBeenCalledWith(null);
      expect(args.setLastRuntimeError).toHaveBeenCalledWith('connection lost');
    });

    it('uses the provided failedTurnStatusLabel instead of default', () => {
      const args = createMockArgs();
      const { setErrorState } = createSessionControllerErrorHandling(args);

      setErrorState('stream error', 'Response failed');

      expect(args.failPendingAssistantTurn).toHaveBeenCalledWith('Response failed');
    });

    it('does not touch voice-specific state', () => {
      const args = createMockArgs();
      const { setErrorState } = createSessionControllerErrorHandling(args);

      setErrorState('some error');

      expect(args.clearToken).not.toHaveBeenCalled();
      expect(args.setCurrentMode).not.toHaveBeenCalled();
      expect(args.setVoiceSessionStatus).not.toHaveBeenCalled();
      expect(args.setVoiceToolState).not.toHaveBeenCalled();
      expect(args.resetVoiceTurnTranscriptState).not.toHaveBeenCalled();
    });
  });

  describe('setVoiceErrorState', () => {
    it('logs with voice-session scope and clears token', () => {
      const args = createMockArgs();
      const { setVoiceErrorState } = createSessionControllerErrorHandling(args);

      setVoiceErrorState('transport failed');

      expect(args.logRuntimeError).toHaveBeenCalledWith(
        'voice-session',
        'runtime entered error state',
        { detail: 'transport failed' },
      );
      expect(args.clearToken).toHaveBeenCalledTimes(1);
    });

    it('resets voice transcript and resumption in-flight flag', () => {
      const args = createMockArgs();
      const { setVoiceErrorState } = createSessionControllerErrorHandling(args);

      setVoiceErrorState('error');

      expect(args.resetVoiceTurnTranscriptState).toHaveBeenCalledTimes(1);
      expect(args.setVoiceResumptionInFlight).toHaveBeenCalledWith(false);
    });

    it('sets resumption to resumeFailed when resumption is not idle', () => {
      const args = createMockArgs();
      args.getVoiceSessionResumptionStatus.mockReturnValue('reconnecting');
      const { setVoiceErrorState } = createSessionControllerErrorHandling(args);

      setVoiceErrorState('resume failed');

      expect(args.setVoiceSessionResumption).toHaveBeenCalledWith({
        status: 'resumeFailed',
        resumable: false,
        lastDetail: 'resume failed',
      });
    });

    it('does not set resumption to resumeFailed when resumption is idle', () => {
      const args = createMockArgs();
      args.getVoiceSessionResumptionStatus.mockReturnValue('idle');
      const { setVoiceErrorState } = createSessionControllerErrorHandling(args);

      setVoiceErrorState('error');

      expect(args.setVoiceSessionResumption).not.toHaveBeenCalled();
    });

    it('sets voice status to error, switches to inactive mode, and sets tool error', () => {
      const args = createMockArgs();
      const { setVoiceErrorState } = createSessionControllerErrorHandling(args);

      setVoiceErrorState('transport failed');

      expect(args.setVoiceSessionStatus).toHaveBeenCalledWith('error');
      expect(args.setLastRuntimeError).toHaveBeenCalledWith('transport failed');
      expect(args.setCurrentMode).toHaveBeenCalledWith('inactive');
      expect(args.setVoiceToolState).toHaveBeenCalledWith({
        status: 'toolError',
        lastError: 'transport failed',
      });
    });

    it('calls endSessionInternal with preservation flags', () => {
      const args = createMockArgs();
      const { setVoiceErrorState } = createSessionControllerErrorHandling(args);

      setVoiceErrorState('transport failed');

      expect(args.endSessionInternal).toHaveBeenCalledWith({
        preserveLastRuntimeError: 'transport failed',
        preserveVoiceRuntimeDiagnostics: true,
        liveSessionEnd: {
          status: 'failed',
          endedReason: 'transport failed',
        },
      });
    });

    it('does not call text-specific callbacks', () => {
      const args = createMockArgs();
      const { setVoiceErrorState } = createSessionControllerErrorHandling(args);

      setVoiceErrorState('error');

      expect(args.textRuntimeFailed).not.toHaveBeenCalled();
      expect(args.failPendingAssistantTurn).not.toHaveBeenCalled();
      expect(args.cleanupTransport).not.toHaveBeenCalled();
    });
  });
});
