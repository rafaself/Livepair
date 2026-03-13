import { describe, expect, it, vi } from 'vitest';
import { createTransportEventRouter } from './transportEventRouter';

function createMockOps() {
  const storeState = {
    setLastDebugEvent: vi.fn(),
    setAssistantActivity: vi.fn(),
    setActiveTransport: vi.fn(),
    setLastRuntimeError: vi.fn(),
    voiceSessionResumption: { status: 'idle', latestHandle: null as string | null, resumable: false, lastDetail: null as string | null },
    voiceSessionDurability: { lastDetail: null as string | null },
  };
  return {
    store: { getState: vi.fn().mockReturnValue(storeState) } as never,
    settingsStore: {
      getState: vi.fn().mockReturnValue({
        settings: { selectedOutputDeviceId: 'default' },
      }),
    } as never,
    logger: {
      onTransportEvent: vi.fn(),
      onSessionEvent: vi.fn(),
    },
    logRuntimeDiagnostic: vi.fn(),
    isVoiceResumptionInFlight: vi.fn().mockReturnValue(false),
    setVoiceResumptionInFlight: vi.fn(),
    currentVoiceSessionStatus: vi.fn().mockReturnValue('ready'),
    currentSpeechLifecycleStatus: vi.fn().mockReturnValue('listening'),
    getToken: vi.fn().mockReturnValue({
      token: 'tok',
      expireTime: '2099-01-01T00:00:00.000Z',
      newSessionExpireTime: '2099-01-01T00:00:00.000Z',
    }),
    setVoiceSessionStatus: vi.fn(),
    setVoiceSessionResumption: vi.fn(),
    setVoiceSessionDurability: vi.fn(),
    persistLiveSessionResumption: vi.fn(),
    syncVoiceDurabilityState: vi.fn(),
    setVoicePlaybackState: vi.fn(),
    updateVoicePlaybackDiagnostics: vi.fn(),
    getVoicePlayback: vi.fn().mockReturnValue({
      enqueue: vi.fn().mockResolvedValue(undefined),
    }),
    stopVoicePlayback: vi.fn().mockResolvedValue(undefined),
    cancelVoiceToolCalls: vi.fn(),
    resetVoiceToolState: vi.fn(),
    resetVoiceTurnTranscriptState: vi.fn(),
    ensureAssistantVoiceTurn: vi.fn(),
    finalizeCurrentVoiceTurns: vi.fn(),
    enqueueVoiceToolCalls: vi.fn(),
    handleVoiceInterruption: vi.fn(),
    applySpeechLifecycleEvent: vi.fn(),
    applyVoiceTranscriptUpdate: vi.fn(),
    appendAssistantDraftTextDelta: vi.fn(),
    completeAssistantDraft: vi.fn(),
    interruptAssistantDraft: vi.fn(),
    discardAssistantDraft: vi.fn(),
    commitAssistantDraft: vi.fn(),
    hasActiveAssistantVoiceTurn: vi.fn().mockReturnValue(false),
    hasQueuedMixedModeAssistantReply: vi.fn().mockReturnValue(false),
    hasStreamingAssistantVoiceTurn: vi.fn().mockReturnValue(false),
    setVoiceErrorState: vi.fn(),
    cleanupTransport: vi.fn(),
    resumeVoiceSession: vi.fn().mockResolvedValue(undefined),
    _storeState: storeState,
  };
}

describe('createTransportEventRouter', () => {
  describe('connection-state-changed', () => {
    it('sets connecting status on connecting state', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'connection-state-changed', state: 'connecting' });

      expect(ops.setVoiceSessionStatus).toHaveBeenCalledWith('connecting');
    });

    it('sets recovering on connecting when resumption is in flight', () => {
      const ops = createMockOps();
      ops.isVoiceResumptionInFlight.mockReturnValue(true);
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'connection-state-changed', state: 'connecting' });

      expect(ops.setVoiceSessionStatus).toHaveBeenCalledWith('recovering');
    });

    it('initializes all subsystems on connected', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'connection-state-changed', state: 'connected' });

      expect(ops.setVoiceSessionStatus).toHaveBeenCalledWith('ready');
      expect(ops.resetVoiceToolState).toHaveBeenCalledTimes(1);
      expect(ops._storeState.setAssistantActivity).toHaveBeenCalledWith('idle');
      expect(ops._storeState.setActiveTransport).toHaveBeenCalledWith('gemini-live');
      expect(ops._storeState.setLastRuntimeError).toHaveBeenCalledWith(null);
      expect(ops.resetVoiceTurnTranscriptState).toHaveBeenCalledTimes(1);
      expect(ops.setVoiceResumptionInFlight).toHaveBeenCalledWith(false);
      expect(ops.setVoicePlaybackState).toHaveBeenCalledWith('idle');
    });

    it('sets resumption status to connected on fresh connection', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'connection-state-changed', state: 'connected' });

      expect(ops.setVoiceSessionResumption).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'connected' }),
      );
    });

    it('sets resumption status to resumed when resumption was in flight', () => {
      const ops = createMockOps();
      ops.isVoiceResumptionInFlight.mockReturnValue(true);
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'connection-state-changed', state: 'connected' });

      expect(ops.setVoiceSessionResumption).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'resumed' }),
      );
    });

    it('initializes playback diagnostics with settings output device on connected', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'connection-state-changed', state: 'connected' });

      expect(ops.updateVoicePlaybackDiagnostics).toHaveBeenCalledWith({
        chunkCount: 0,
        queueDepth: 0,
        sampleRateHz: null,
        lastError: null,
        selectedOutputDeviceId: 'default',
      });
    });

    it('sets recovering on disconnected when resumption is in flight', () => {
      const ops = createMockOps();
      ops.isVoiceResumptionInFlight.mockReturnValue(true);
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'connection-state-changed', state: 'disconnected' });

      expect(ops.setVoiceSessionStatus).toHaveBeenCalledWith('recovering');
      expect(ops.cleanupTransport).not.toHaveBeenCalled();
    });

    it('cleans up on disconnected when no resumption is in flight', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'connection-state-changed', state: 'disconnected' });

      expect(ops.setVoiceSessionStatus).toHaveBeenCalledWith('disconnected');
      expect(ops.cancelVoiceToolCalls).toHaveBeenCalledWith('voice transport disconnected');
      expect(ops.resetVoiceTurnTranscriptState).toHaveBeenCalledTimes(1);
      expect(ops.resetVoiceToolState).toHaveBeenCalledTimes(1);
      expect(ops.stopVoicePlayback).toHaveBeenCalledTimes(1);
      expect(ops.cleanupTransport).toHaveBeenCalledTimes(1);
      expect(ops._storeState.setAssistantActivity).toHaveBeenCalledWith('idle');
      expect(ops._storeState.setActiveTransport).toHaveBeenCalledWith(null);
    });
  });

  describe('go-away', () => {
    it('sets resumption to goAway and triggers resume', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'go-away', detail: 'server draining' });

      expect(ops.setVoiceSessionResumption).toHaveBeenCalledWith({
        status: 'goAway',
        lastDetail: 'server draining',
      });
      expect(ops.cancelVoiceToolCalls).toHaveBeenCalledWith('server draining');
      expect(ops.setVoiceSessionDurability).toHaveBeenCalledWith(
        expect.objectContaining({ lastDetail: 'server draining' }),
      );
      expect(ops.resumeVoiceSession).toHaveBeenCalledWith('server draining');
    });

    it('uses fallback detail when none provided', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'go-away' } as never);

      expect(ops.setVoiceSessionResumption).toHaveBeenCalledWith(
        expect.objectContaining({ lastDetail: 'Voice session unavailable' }),
      );
    });

    it('ignores go-away while the voice session is already stopping', () => {
      const ops = createMockOps();
      ops.currentVoiceSessionStatus.mockReturnValue('stopping');
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'go-away', detail: 'server draining' });

      expect(ops.resumeVoiceSession).not.toHaveBeenCalled();
      expect(ops.setVoiceSessionResumption).not.toHaveBeenCalledWith(
        expect.objectContaining({ status: 'goAway' }),
      );
    });
  });

  describe('connection-terminated', () => {
    it('triggers resume when voice session is active', () => {
      const ops = createMockOps();
      ops.currentVoiceSessionStatus.mockReturnValue('ready');
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'connection-terminated', detail: 'transport recycled' });

      expect(ops.cancelVoiceToolCalls).toHaveBeenCalledWith('transport recycled');
      expect(ops.resumeVoiceSession).toHaveBeenCalledWith('transport recycled');
    });

    it('no-ops when voice session is stopping', () => {
      const ops = createMockOps();
      ops.currentVoiceSessionStatus.mockReturnValue('stopping');
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'connection-terminated', detail: 'recycled' });

      expect(ops.resumeVoiceSession).not.toHaveBeenCalled();
    });

    it('no-ops when voice session is disconnected', () => {
      const ops = createMockOps();
      ops.currentVoiceSessionStatus.mockReturnValue('disconnected');
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'connection-terminated', detail: 'recycled' });

      expect(ops.resumeVoiceSession).not.toHaveBeenCalled();
    });

    it('no-ops when voice session is in error', () => {
      const ops = createMockOps();
      ops.currentVoiceSessionStatus.mockReturnValue('error');
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'connection-terminated', detail: 'recycled' });

      expect(ops.resumeVoiceSession).not.toHaveBeenCalled();
    });
  });

  describe('error', () => {
    it('delegates to setVoiceErrorState', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'error', detail: 'transport failed' });

      expect(ops.cancelVoiceToolCalls).toHaveBeenCalledWith('transport failed');
      expect(ops.setVoiceErrorState).toHaveBeenCalledWith('transport failed');
    });
  });

  describe('session-resumption-update', () => {
    it('updates resumption with handle and resumable flag', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({
        type: 'session-resumption-update',
        handle: 'handles/v2',
        resumable: true,
      } as never);

      expect(ops.setVoiceSessionResumption).toHaveBeenCalledWith(
        expect.objectContaining({
          latestHandle: 'handles/v2',
          resumable: true,
        }),
      );
      expect(ops.persistLiveSessionResumption).toHaveBeenCalledWith({
        resumptionHandle: 'handles/v2',
        lastResumptionUpdateAt: expect.any(String),
        restorable: true,
        invalidatedAt: null,
        invalidationReason: null,
      });
    });

    it('clears the latest handle when the transport explicitly reports no resumable handle', () => {
      const ops = createMockOps();
      ops._storeState.voiceSessionResumption.latestHandle = 'handles/existing';
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({
        type: 'session-resumption-update',
        handle: null,
        resumable: false,
      } as never);

      expect(ops.setVoiceSessionResumption).toHaveBeenCalledWith(
        expect.objectContaining({
          latestHandle: null,
          resumable: false,
          lastDetail: null,
        }),
      );
      expect(ops.persistLiveSessionResumption).toHaveBeenCalledWith({
        resumptionHandle: null,
        lastResumptionUpdateAt: expect.any(String),
        restorable: false,
        invalidatedAt: expect.any(String),
        invalidationReason: null,
      });
    });
  });

  describe('audio-error', () => {
    it('updates playback diagnostics, sets runtime error, and stops playback with error state', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'audio-error', detail: 'malformed audio' });

      expect(ops.updateVoicePlaybackDiagnostics).toHaveBeenCalledWith({ lastError: 'malformed audio' });
      expect(ops._storeState.setLastRuntimeError).toHaveBeenCalledWith('malformed audio');
      expect(ops.stopVoicePlayback).toHaveBeenCalledWith('error');
    });
  });

  describe('interrupted', () => {
    it('marks turn completed and delegates to interruption handler', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'interrupted' });

      expect(ops.interruptAssistantDraft).toHaveBeenCalledTimes(1);
      expect(ops.discardAssistantDraft).toHaveBeenCalledTimes(1);
      expect(ops.cancelVoiceToolCalls).toHaveBeenCalledWith('voice turn interrupted');
      expect(ops.finalizeCurrentVoiceTurns).toHaveBeenCalledWith('interrupted');
      expect(ops.handleVoiceInterruption).toHaveBeenCalledTimes(1);
    });

    it('ignores late assistant text deltas while the interrupted turn is unavailable', () => {
      const ops = createMockOps();
      ops.currentVoiceSessionStatus.mockReturnValue('interrupted');
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'text-delta', text: 'late text' });

      expect(ops.appendAssistantDraftTextDelta).not.toHaveBeenCalled();
      expect(ops.logRuntimeDiagnostic).toHaveBeenCalledWith(
        'voice-session',
        'ignored assistant output while turn is unavailable',
        expect.objectContaining({
          voiceStatus: 'interrupted',
          eventType: 'text-delta',
        }),
      );
    });

    it('allows assistant text deltas for a queued mixed-mode reply while recovery is settling', () => {
      const ops = createMockOps();
      ops.currentVoiceSessionStatus.mockReturnValue('recovering');
      ops.hasQueuedMixedModeAssistantReply.mockReturnValue(true);
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'text-delta', text: 'next reply' });

      expect(ops.appendAssistantDraftTextDelta).toHaveBeenCalledWith('next reply');
      expect(ops.logRuntimeDiagnostic).not.toHaveBeenCalled();
    });

    it('allows assistant transcript corrections on an interrupted turn without reopening canonical draft state', () => {
      const ops = createMockOps();
      ops.currentVoiceSessionStatus.mockReturnValue('interrupted');
      ops.hasActiveAssistantVoiceTurn.mockReturnValue(true);
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'output-transcript', text: 'late transcript', isFinal: false } as never);

      expect(ops.applySpeechLifecycleEvent).toHaveBeenCalledWith({ type: 'assistant.output.started' });
      expect(ops.ensureAssistantVoiceTurn).toHaveBeenCalledTimes(1);
      expect(ops.applyVoiceTranscriptUpdate).toHaveBeenCalledWith('assistant', 'late transcript', false);
      expect(ops.appendAssistantDraftTextDelta).not.toHaveBeenCalled();
      expect(ops.commitAssistantDraft).not.toHaveBeenCalled();
    });

    it('ignores late assistant audio chunks while no interrupted or queued assistant turn can accept them', () => {
      const ops = createMockOps();
      ops.currentVoiceSessionStatus.mockReturnValue('recovering');
      const chunk = new Uint8Array([9, 9, 9]);
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'audio-chunk', chunk });

      expect(ops.applySpeechLifecycleEvent).not.toHaveBeenCalled();
      expect(ops.ensureAssistantVoiceTurn).not.toHaveBeenCalled();
      expect(ops.getVoicePlayback().enqueue).not.toHaveBeenCalled();
      expect(ops.logRuntimeDiagnostic).toHaveBeenCalledWith(
        'voice-session',
        'ignored assistant output while turn is unavailable',
        expect.objectContaining({
          voiceStatus: 'recovering',
          eventType: 'audio-chunk',
        }),
      );
    });

  });

  describe('text-delta', () => {
    it('routes streamed assistant text into the transient assistant draft only', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'text-delta', text: 'Hello' });

      expect(ops.appendAssistantDraftTextDelta).toHaveBeenCalledWith('Hello');
      expect(ops.completeAssistantDraft).not.toHaveBeenCalled();
      expect(ops.finalizeCurrentVoiceTurns).not.toHaveBeenCalled();
    });
  });

  describe('input-transcript', () => {
    it('fires user speech lifecycle event and updates transcript', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'input-transcript', text: 'hello', isFinal: true } as never);

      expect(ops.applySpeechLifecycleEvent).toHaveBeenCalledWith({ type: 'user.speech.detected' });
      expect(ops.applyVoiceTranscriptUpdate).toHaveBeenCalledWith('user', 'hello', true);
    });
  });

  describe('output-transcript', () => {
    it('fires assistant output lifecycle event and updates transcript', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'output-transcript', text: 'hi there', isFinal: false } as never);

      expect(ops.applySpeechLifecycleEvent).toHaveBeenCalledWith({ type: 'assistant.output.started' });
      expect(ops.ensureAssistantVoiceTurn).toHaveBeenCalledTimes(1);
      expect(ops.applyVoiceTranscriptUpdate).toHaveBeenCalledWith('assistant', 'hi there', false);
    });
  });

  describe('audio-chunk', () => {
    it('fires assistant output lifecycle event and enqueues chunk', () => {
      const ops = createMockOps();
      const chunk = new Uint8Array([1, 2, 3]);
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'audio-chunk', chunk });

      expect(ops.applySpeechLifecycleEvent).toHaveBeenCalledWith({ type: 'assistant.output.started' });
      expect(ops.ensureAssistantVoiceTurn).toHaveBeenCalledTimes(1);
      expect(ops.getVoicePlayback().enqueue).toHaveBeenCalledWith(chunk);
    });
  });

  describe('generation-complete', () => {
    it('does not finalize voice turns, draft ownership, or advance the speech lifecycle on its own', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'generation-complete' });

      expect(ops.completeAssistantDraft).not.toHaveBeenCalled();
      expect(ops.commitAssistantDraft).not.toHaveBeenCalled();
      expect(ops.finalizeCurrentVoiceTurns).not.toHaveBeenCalled();
      expect(ops.applySpeechLifecycleEvent).not.toHaveBeenCalled();
    });
  });

  describe('turn-complete', () => {
    it('finalizes and commits the assistant draft only when turn-complete arrives', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'turn-complete' });

      expect(ops.completeAssistantDraft).toHaveBeenCalledTimes(1);
      expect(ops.commitAssistantDraft).toHaveBeenCalledTimes(1);
      expect(ops.finalizeCurrentVoiceTurns).toHaveBeenCalledWith('completed');
    });

    it('ignores late turn-complete after interruption so interrupted drafts cannot commit normally', () => {
      const ops = createMockOps();
      ops.currentVoiceSessionStatus.mockReturnValue('interrupted');
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'turn-complete' });

      expect(ops.completeAssistantDraft).not.toHaveBeenCalled();
      expect(ops.commitAssistantDraft).not.toHaveBeenCalled();
      expect(ops.finalizeCurrentVoiceTurns).not.toHaveBeenCalledWith('completed');
      expect(ops.applySpeechLifecycleEvent).not.toHaveBeenCalled();
      expect(ops.logRuntimeDiagnostic).toHaveBeenCalledWith(
        'voice-session',
        'ignored assistant output while turn is unavailable',
        expect.objectContaining({
          voiceStatus: 'interrupted',
          eventType: 'turn-complete',
        }),
      );
    });

    it('allows turn-complete once a new assistant turn is actively streaming during recovery', () => {
      const ops = createMockOps();
      ops.currentVoiceSessionStatus.mockReturnValue('recovering');
      ops.hasStreamingAssistantVoiceTurn.mockReturnValue(true);
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'turn-complete' });

      expect(ops.completeAssistantDraft).toHaveBeenCalledTimes(1);
      expect(ops.commitAssistantDraft).toHaveBeenCalledTimes(1);
      expect(ops.finalizeCurrentVoiceTurns).toHaveBeenCalledWith('completed');
    });
  });

  describe('tool-call', () => {
    it('enqueues tool calls', () => {
      const ops = createMockOps();
      const calls = [{ name: 'get_current_mode', id: 'c1', args: {} }];
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'tool-call', calls } as never);

      expect(ops.enqueueVoiceToolCalls).toHaveBeenCalledWith(calls);
    });

    it('ignores tool calls while the voice session is unavailable', () => {
      const ops = createMockOps();
      ops.currentVoiceSessionStatus.mockReturnValue('interrupted');
      const calls = [{ name: 'get_current_mode', id: 'c1', args: {} }];
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'tool-call', calls } as never);

      expect(ops.enqueueVoiceToolCalls).not.toHaveBeenCalled();
      expect(ops.logRuntimeDiagnostic).toHaveBeenCalledWith(
        'voice-session',
        'ignored tool call while turn is unavailable',
        expect.objectContaining({
          voiceStatus: 'interrupted',
          callCount: 1,
        }),
      );
    });
  });

  describe('turn-complete', () => {
    it('marks turn completed and fires assistant.turn.completed when assistant is speaking', () => {
      const ops = createMockOps();
      ops.currentSpeechLifecycleStatus.mockReturnValue('assistantSpeaking');
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'turn-complete' });

      expect(ops.finalizeCurrentVoiceTurns).toHaveBeenCalledWith('completed');
      expect(ops.applySpeechLifecycleEvent).toHaveBeenCalledWith({ type: 'assistant.turn.completed' });
    });

    it('marks turn completed and fires user.turn.settled when user is speaking', () => {
      const ops = createMockOps();
      ops.currentSpeechLifecycleStatus.mockReturnValue('userSpeaking');
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'turn-complete' });

      expect(ops.finalizeCurrentVoiceTurns).toHaveBeenCalledWith('completed');
      expect(ops.applySpeechLifecycleEvent).toHaveBeenCalledWith({ type: 'user.turn.settled' });
    });

    it('marks turn completed without lifecycle event in other states', () => {
      const ops = createMockOps();
      ops.currentSpeechLifecycleStatus.mockReturnValue('listening');
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'turn-complete' });

      expect(ops.finalizeCurrentVoiceTurns).toHaveBeenCalledWith('completed');
      expect(ops.applySpeechLifecycleEvent).not.toHaveBeenCalled();
    });

    it('does not treat a post-interruption turn-complete as a normal assistant completion transition', () => {
      const ops = createMockOps();
      ops.currentVoiceSessionStatus.mockReturnValue('interrupted');
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'turn-complete' });

      expect(ops.finalizeCurrentVoiceTurns).not.toHaveBeenCalledWith('completed');
      expect(ops.applySpeechLifecycleEvent).not.toHaveBeenCalled();
    });
  });

  describe('logging and debug events', () => {
    it('logs every transport event and sets debug event', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'interrupted' });

      expect(ops.logger.onTransportEvent).toHaveBeenCalledWith({ type: 'interrupted' });
      expect(ops._storeState.setLastDebugEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: 'transport',
          type: 'interrupted',
        }),
      );
    });
  });
});
