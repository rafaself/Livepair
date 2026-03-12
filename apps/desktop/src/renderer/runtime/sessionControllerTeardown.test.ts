import { describe, expect, it, vi } from 'vitest';
import { createSessionControllerTeardown } from './sessionControllerTeardown';

function createMockStore(overrides: Record<string, unknown> = {}) {
  return {
    getState: vi.fn().mockReturnValue({
      speechLifecycle: { status: 'off' },
      voiceSessionStatus: 'disconnected',
      voiceCaptureState: 'idle',
      voicePlaybackState: 'idle',
      screenCaptureState: 'disabled',
      voiceSessionResumption: { status: 'idle', latestHandle: null, resumable: false, lastDetail: null },
      voiceSessionDurability: { compressionEnabled: false, tokenValid: false, tokenRefreshing: false, tokenRefreshFailed: false, expireTime: null, newSessionExpireTime: null, lastDetail: null },
      voiceToolState: { status: 'idle', toolName: null, callId: null, lastError: null },
      setAssistantActivity: vi.fn(),
      setLastRuntimeError: vi.fn(),
      ...overrides,
    }),
  };
}

function createMockArgs(storeOverrides: Record<string, unknown> = {}) {
  const store = createMockStore(storeOverrides);
  let resolveScreenStop: (() => void) | null = null;
  let deferScreenStop = false;
  return {
    store: store as never,
    currentSpeechLifecycleStatus: vi.fn().mockReturnValue('off'),
    currentTextSessionStatus: vi.fn().mockReturnValue('idle'),
    applySpeechLifecycleEvent: vi.fn(),
    clearToken: vi.fn(),
    clearCurrentVoiceTranscript: vi.fn(),
    cleanupTransport: vi.fn(),
    getActiveTransport: vi.fn().mockReturnValue(null),
    getVoiceCapture: vi.fn().mockReturnValue({ stop: vi.fn().mockResolvedValue(undefined) }),
    hasActiveTextStream: vi.fn().mockReturnValue(false),
    hasScreenCapture: vi.fn().mockReturnValue(false),
    hasTextRuntimeActivity: vi.fn().mockReturnValue(false),
    hasVoiceCapture: vi.fn().mockReturnValue(false),
    hasVoicePlayback: vi.fn().mockReturnValue(false),
    resetRuntimeState: vi.fn(),
    resetVoiceSessionDurability: vi.fn(),
    resetVoiceSessionResumption: vi.fn(),
    resetVoiceToolState: vi.fn(),
    setVoiceCaptureState: vi.fn(),
    setVoicePlaybackState: vi.fn(),
    setVoiceResumptionInFlight: vi.fn(),
    setVoiceSessionDurability: vi.fn(),
    setVoiceSessionResumption: vi.fn(),
    setVoiceSessionStatus: vi.fn(),
    setVoiceToolStateSnapshot: vi.fn(),
    stopScreenCaptureInternal: vi.fn().mockImplementation(() => {
      if (!deferScreenStop) {
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        resolveScreenStop = resolve;
      });
    }),
    stopVoiceCapture: vi.fn().mockResolvedValue(undefined),
    stopVoicePlayback: vi.fn().mockResolvedValue(undefined),
    textDisconnectRequested: vi.fn(),
    enableDeferredScreenStop: () => {
      deferScreenStop = true;
    },
    resolveScreenStop: () => {
      resolveScreenStop?.();
      resolveScreenStop = null;
    },
    _store: store,
  };
}

describe('createSessionControllerTeardown', () => {
  describe('hasSpeechRuntimeActivity', () => {
    it('returns false when all subsystems are inactive', () => {
      const args = createMockArgs();
      const { hasSpeechRuntimeActivity } = createSessionControllerTeardown(args as never);

      expect(hasSpeechRuntimeActivity()).toBe(false);
    });

    it('returns true when speechLifecycle is active', () => {
      const args = createMockArgs({ speechLifecycle: { status: 'listening' } });
      const { hasSpeechRuntimeActivity } = createSessionControllerTeardown(args as never);

      expect(hasSpeechRuntimeActivity()).toBe(true);
    });

    it('returns true when voiceSessionStatus is ready', () => {
      const args = createMockArgs({ voiceSessionStatus: 'ready' });
      const { hasSpeechRuntimeActivity } = createSessionControllerTeardown(args as never);

      expect(hasSpeechRuntimeActivity()).toBe(true);
    });

    it('returns false when voiceSessionStatus is error', () => {
      const args = createMockArgs({ voiceSessionStatus: 'error' });
      const { hasSpeechRuntimeActivity } = createSessionControllerTeardown(args as never);

      expect(hasSpeechRuntimeActivity()).toBe(false);
    });

    it('returns true when voiceCaptureState is capturing', () => {
      const args = createMockArgs({ voiceCaptureState: 'capturing' });
      const { hasSpeechRuntimeActivity } = createSessionControllerTeardown(args as never);

      expect(hasSpeechRuntimeActivity()).toBe(true);
    });

    it('returns true when voicePlaybackState is playing', () => {
      const args = createMockArgs({ voicePlaybackState: 'playing' });
      const { hasSpeechRuntimeActivity } = createSessionControllerTeardown(args as never);

      expect(hasSpeechRuntimeActivity()).toBe(true);
    });

    it('returns true when screenCaptureState is active', () => {
      const args = createMockArgs({ screenCaptureState: 'active' });
      const { hasSpeechRuntimeActivity } = createSessionControllerTeardown(args as never);

      expect(hasSpeechRuntimeActivity()).toBe(true);
    });

    it('returns true when active transport is gemini-live', () => {
      const args = createMockArgs();
      args.getActiveTransport.mockReturnValue({ kind: 'gemini-live' });
      const { hasSpeechRuntimeActivity } = createSessionControllerTeardown(args as never);

      expect(hasSpeechRuntimeActivity()).toBe(true);
    });
  });

  describe('teardownActiveRuntime – fast path (no active runtime)', () => {
    it('resets state and clears token when nothing is active', async () => {
      const args = createMockArgs();
      const { teardownActiveRuntime } = createSessionControllerTeardown(args as never);

      await teardownActiveRuntime();

      expect(args.resetRuntimeState).toHaveBeenCalledWith('disconnected', {
        preserveConversationTurns: false,
      });
      expect(args.setVoiceSessionStatus).toHaveBeenCalledWith('disconnected');
      expect(args.clearToken).toHaveBeenCalledTimes(1);
      expect(args.setVoiceResumptionInFlight).toHaveBeenCalledWith(false);
      expect(args.clearCurrentVoiceTranscript).toHaveBeenCalledTimes(1);
    });

    it('fires speech end events when speech lifecycle is active', async () => {
      const args = createMockArgs();
      args.currentSpeechLifecycleStatus.mockReturnValue('listening');
      const { teardownActiveRuntime } = createSessionControllerTeardown(args as never);

      await teardownActiveRuntime();

      expect(args.applySpeechLifecycleEvent).toHaveBeenCalledWith({ type: 'session.end.requested' });
      expect(args.applySpeechLifecycleEvent).toHaveBeenCalledWith({ type: 'session.ended' });
    });

    it('resets voice diagnostics when preservation is disabled', async () => {
      const args = createMockArgs();
      const { teardownActiveRuntime } = createSessionControllerTeardown(args as never);

      await teardownActiveRuntime();

      expect(args.resetVoiceSessionResumption).toHaveBeenCalledTimes(1);
      expect(args.resetVoiceSessionDurability).toHaveBeenCalledTimes(1);
      expect(args.resetVoiceToolState).toHaveBeenCalledTimes(1);
    });

    it('preserves voice diagnostics when preservation is enabled', async () => {
      const resumption = { status: 'resumed', latestHandle: 'h1', resumable: true, lastDetail: null };
      const durability = { compressionEnabled: true, tokenValid: true, tokenRefreshing: false, tokenRefreshFailed: false, expireTime: '2099-01-01', newSessionExpireTime: '2099-01-01', lastDetail: null };
      const toolState = { status: 'idle', toolName: null, callId: null, lastError: null };
      const args = createMockArgs({
        voiceSessionResumption: resumption,
        voiceSessionDurability: durability,
        voiceToolState: toolState,
      });
      const { teardownActiveRuntime } = createSessionControllerTeardown(args as never);

      await teardownActiveRuntime({ preserveVoiceRuntimeDiagnostics: true });

      expect(args.setVoiceSessionResumption).toHaveBeenCalledWith(resumption);
      expect(args.setVoiceSessionDurability).toHaveBeenCalledWith(durability);
      expect(args.setVoiceToolStateSnapshot).toHaveBeenCalledWith(toolState);
      expect(args.resetVoiceSessionResumption).not.toHaveBeenCalled();
    });

    it('preserves lastRuntimeError when specified', async () => {
      const args = createMockArgs();
      const { teardownActiveRuntime } = createSessionControllerTeardown(args as never);

      await teardownActiveRuntime({ preserveLastRuntimeError: 'kept error' });

      const storeState = args._store.getState();
      expect(storeState.setLastRuntimeError).toHaveBeenCalledWith('kept error');
    });

    it('accepts a custom textSessionStatus', async () => {
      const args = createMockArgs();
      const { teardownActiveRuntime } = createSessionControllerTeardown(args as never);

      await teardownActiveRuntime({ textSessionStatus: 'error' as never });

      expect(args.resetRuntimeState).toHaveBeenCalledWith('error', {
        preserveConversationTurns: false,
      });
    });

    it('can preserve conversation state while tearing down speech runtime', async () => {
      const args = createMockArgs();
      const { teardownActiveRuntime } = createSessionControllerTeardown(args as never);

      await teardownActiveRuntime({
        textSessionStatus: 'disconnected',
        preserveConversationTurns: true,
      } as never);

      expect(args.resetRuntimeState).toHaveBeenCalledWith('disconnected', {
        preserveConversationTurns: true,
      });
    });
  });

  describe('teardownActiveRuntime – slow path (active runtime)', () => {
    it('stops voice capture, screen capture, transport, and playback', async () => {
      const disconnect = vi.fn().mockResolvedValue(undefined);
      const args = createMockArgs({ voiceCaptureState: 'capturing' });
      args.getActiveTransport.mockReturnValue({ kind: 'gemini-live', disconnect });
      args.hasVoiceCapture.mockReturnValue(true);
      args.hasScreenCapture.mockReturnValue(true);
      args.hasVoicePlayback.mockReturnValue(true);
      const { teardownActiveRuntime } = createSessionControllerTeardown(args as never);

      await teardownActiveRuntime();

      expect(args.stopVoiceCapture).toHaveBeenCalledTimes(1);
      expect(args.stopScreenCaptureInternal).toHaveBeenCalledTimes(1);
      expect(disconnect).toHaveBeenCalledTimes(1);
      expect(args.stopVoicePlayback).toHaveBeenCalledTimes(1);
    });

    it('awaits screen capture cleanup before disconnecting the transport', async () => {
      const disconnect = vi.fn().mockResolvedValue(undefined);
      const args = createMockArgs({ voiceCaptureState: 'capturing' });
      args.getActiveTransport.mockReturnValue({ kind: 'gemini-live', disconnect });
      args.hasVoiceCapture.mockReturnValue(true);
      args.hasScreenCapture.mockReturnValue(true);
      args.hasVoicePlayback.mockReturnValue(true);
      args.enableDeferredScreenStop();
      const { teardownActiveRuntime } = createSessionControllerTeardown(args as never);

      const teardownPromise = teardownActiveRuntime();
      await vi.waitFor(() => {
        expect(args.stopScreenCaptureInternal).toHaveBeenCalledTimes(1);
      });
      expect(disconnect).not.toHaveBeenCalled();

      args.resolveScreenStop();
      await teardownPromise;

      expect(disconnect).toHaveBeenCalledTimes(1);
    });

    it('fires text disconnect when text stream is active', async () => {
      const args = createMockArgs();
      args.hasActiveTextStream.mockReturnValue(true);
      args.hasTextRuntimeActivity.mockReturnValue(true);
      const { teardownActiveRuntime } = createSessionControllerTeardown(args as never);

      await teardownActiveRuntime();

      expect(args.textDisconnectRequested).toHaveBeenCalledTimes(1);
    });

    it('fires speech end.requested when speech is active', async () => {
      const args = createMockArgs({ voiceSessionStatus: 'ready' });
      const { teardownActiveRuntime } = createSessionControllerTeardown(args as never);

      await teardownActiveRuntime();

      expect(args.applySpeechLifecycleEvent).toHaveBeenCalledWith({ type: 'session.end.requested' });
      expect(args.setVoiceSessionStatus).toHaveBeenCalledWith('stopping');
    });

    it('sets voiceCaptureState to stopped when capture exists', async () => {
      const args = createMockArgs();
      args.hasVoiceCapture.mockReturnValue(true);
      args.hasVoicePlayback.mockReturnValue(true);
      const { teardownActiveRuntime } = createSessionControllerTeardown(args as never);

      await teardownActiveRuntime();

      expect(args.setVoiceCaptureState).toHaveBeenCalledWith('stopped');
    });

    it('sets voiceCaptureState to idle when no capture exists', async () => {
      const args = createMockArgs();
      args.hasVoiceCapture.mockReturnValue(false);
      args.hasVoicePlayback.mockReturnValue(true);
      const { teardownActiveRuntime } = createSessionControllerTeardown(args as never);

      await teardownActiveRuntime();

      expect(args.setVoiceCaptureState).toHaveBeenCalledWith('idle');
    });

    it('executes finally block even when teardown throws', async () => {
      const args = createMockArgs({ voiceCaptureState: 'capturing' });
      args.hasVoiceCapture.mockReturnValue(true);
      args.stopVoiceCapture.mockRejectedValue(new Error('capture stop failed'));
      args.getActiveTransport.mockReturnValue({ kind: 'gemini-live', disconnect: vi.fn() });
      const { teardownActiveRuntime } = createSessionControllerTeardown(args as never);

      await expect(teardownActiveRuntime()).rejects.toThrow('capture stop failed');

      expect(args.cleanupTransport).toHaveBeenCalledTimes(1);
      expect(args.resetRuntimeState).toHaveBeenCalledTimes(1);
      expect(args.setVoicePlaybackState).toHaveBeenCalledWith('stopped');
      expect(args.setVoiceSessionStatus).toHaveBeenCalledWith('disconnected');
    });

    it('skips voice capture stop when not in stoppable state', async () => {
      const args = createMockArgs({ voiceCaptureState: 'idle' });
      args.hasVoiceCapture.mockReturnValue(true);
      args.hasVoicePlayback.mockReturnValue(true);
      const { teardownActiveRuntime } = createSessionControllerTeardown(args as never);

      await teardownActiveRuntime();

      expect(args.stopVoiceCapture).not.toHaveBeenCalled();
    });

    it('preserves conversation state on the slow path when speech mode ends', async () => {
      const args = createMockArgs({ voiceSessionStatus: 'ready' });
      args.hasVoicePlayback.mockReturnValue(true);
      const { teardownActiveRuntime } = createSessionControllerTeardown(args as never);

      await teardownActiveRuntime({
        preserveConversationTurns: true,
      } as never);

      expect(args.resetRuntimeState).toHaveBeenCalledWith('disconnected', {
        preserveConversationTurns: true,
      });
      expect(args.stopVoicePlayback).toHaveBeenCalledTimes(1);
    });
  });
});
