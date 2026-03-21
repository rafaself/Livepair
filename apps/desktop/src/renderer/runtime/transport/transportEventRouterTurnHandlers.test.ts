import { describe, expect, it, vi } from 'vitest';
import { createDefaultVoiceLiveSignalDiagnostics } from '../core/defaults';
import { handleTransportTurnEvent } from './transportEventRouterTurnHandlers';

function createMockContext() {
  const store = {
    setLastRuntimeError: vi.fn(),
    voiceTranscriptDiagnostics: {
      inputTranscriptCount: 0,
      lastInputTranscriptAt: null,
      outputTranscriptCount: 0,
      lastOutputTranscriptAt: null,
      assistantTextFallbackCount: 0,
      lastAssistantTextFallbackAt: null,
      lastAssistantTextFallbackReason: null,
    },
    setVoiceTranscriptDiagnostics: vi.fn((patch: Record<string, unknown>) => {
      store.voiceTranscriptDiagnostics = {
        ...store.voiceTranscriptDiagnostics,
        ...patch,
      };
    }),
    setIgnoredAssistantOutputDiagnostics: vi.fn(),
    voiceLiveSignalDiagnostics: createDefaultVoiceLiveSignalDiagnostics(),
  };

  const ops = {
    logRuntimeDiagnostic: vi.fn(),
    currentVoiceSessionStatus: vi.fn().mockReturnValue('active'),
    currentSpeechLifecycleStatus: vi.fn().mockReturnValue('listening'),
    getVoicePlayback: vi.fn().mockReturnValue({
      enqueue: vi.fn().mockResolvedValue(undefined),
    }),
    cancelVoiceToolCalls: vi.fn(),
    ensureAssistantVoiceTurn: vi.fn().mockReturnValue(true),
    finalizeCurrentVoiceTurns: vi.fn(),
    attachCurrentAssistantTurn: vi.fn(),
    enqueueVoiceToolCalls: vi.fn(),
    handleVoiceInterruption: vi.fn(),
    applySpeechLifecycleEvent: vi.fn(),
    applyVoiceTranscriptUpdate: vi.fn(),
    appendAssistantDraftTextDelta: vi.fn(),
    completeAssistantDraft: vi.fn(),
    interruptAssistantDraft: vi.fn(),
    discardAssistantDraft: vi.fn(),
    commitAssistantDraft: vi.fn().mockReturnValue(null),
    hasOpenVoiceTurnFence: vi.fn().mockReturnValue(true),
    hasPendingVoiceToolCall: vi.fn().mockReturnValue(false),
    hasQueuedMixedModeAssistantReply: vi.fn().mockReturnValue(false),
    hasStreamingAssistantVoiceTurn: vi.fn().mockReturnValue(false),
    updateVoiceLiveSignalDiagnostics: vi.fn((patch: Record<string, unknown>) => {
      store.voiceLiveSignalDiagnostics = {
        ...store.voiceLiveSignalDiagnostics,
        ...patch,
      };
    }),
  };

  return { ops, store };
}

describe('handleTransportTurnEvent', () => {
  it('allows assistant text deltas for a queued mixed-mode reply while recovery is settling', () => {
    const context = createMockContext();
    context.ops.currentVoiceSessionStatus.mockReturnValue('recovering');
    context.ops.hasQueuedMixedModeAssistantReply.mockReturnValue(true);

    handleTransportTurnEvent(context as never, { type: 'text-delta', text: 'next reply' });

    expect(context.ops.appendAssistantDraftTextDelta).toHaveBeenCalledWith('next reply');
    expect(context.ops.logRuntimeDiagnostic).not.toHaveBeenCalled();
  });

  it('ignores late turn-complete after interruption so interrupted drafts cannot commit normally', () => {
    const context = createMockContext();
    context.ops.currentVoiceSessionStatus.mockReturnValue('interrupted');

    handleTransportTurnEvent(context as never, { type: 'turn-complete' });

    expect(context.ops.completeAssistantDraft).not.toHaveBeenCalled();
    expect(context.ops.commitAssistantDraft).not.toHaveBeenCalled();
    expect(context.ops.finalizeCurrentVoiceTurns).not.toHaveBeenCalledWith('completed');
    expect(context.ops.applySpeechLifecycleEvent).not.toHaveBeenCalled();
    expect(context.ops.logRuntimeDiagnostic).toHaveBeenCalledWith(
      'voice-session',
      'ignored assistant output while turn is unavailable',
      expect.objectContaining({
        voiceStatus: 'interrupted',
        eventType: 'turn-complete',
      }),
    );
  });

  it('tracks ignored assistant output counts and reasons in diagnostics', () => {
    const context = createMockContext();
    context.ops.currentVoiceSessionStatus.mockReturnValue('recovering');

    handleTransportTurnEvent(context as never, {
      type: 'audio-chunk',
      chunk: new Uint8Array([1, 2, 3]),
    });
    handleTransportTurnEvent(context as never, {
      type: 'audio-chunk',
      chunk: new Uint8Array([4, 5, 6]),
    });

    expect(context.ops.logRuntimeDiagnostic).toHaveBeenLastCalledWith(
      'voice-session',
      'ignored assistant output while turn is unavailable',
      expect.objectContaining({
        voiceStatus: 'recovering',
        eventType: 'audio-chunk',
        ignoreReason: 'turn-unavailable',
        ignoreCount: 2,
        ignoredAudioChunkCount: 2,
        lastIgnoredReason: 'turn-unavailable',
        lastIgnoredEventType: 'audio-chunk',
      }),
    );
    expect(context.store.setIgnoredAssistantOutputDiagnostics).toHaveBeenLastCalledWith(
      expect.objectContaining({
        totalCount: 2,
        countsByEventType: {
          textDelta: 0,
          outputTranscript: 0,
          audioChunk: 2,
          turnComplete: 0,
        },
        countsByReason: {
          turnUnavailable: 2,
          lifecycleFence: 0,
          noOpenTurnFence: 0,
        },
        lastIgnoredReason: 'turn-unavailable',
        lastIgnoredEventType: 'audio-chunk',
        lastIgnoredVoiceSessionStatus: 'recovering',
        lastIgnoredAt: expect.any(String),
      }),
    );
  });

  it('tracks transcript arrival and only counts assistant text fallback once per turn', () => {
    const context = createMockContext();

    handleTransportTurnEvent(context as never, { type: 'text-delta', text: 'hello' });
    handleTransportTurnEvent(context as never, { type: 'text-delta', text: ' again' });
    handleTransportTurnEvent(context as never, {
      type: 'input-transcript',
      text: 'user said hello',
      isFinal: false,
    });
    handleTransportTurnEvent(context as never, {
      type: 'output-transcript',
      text: 'assistant replied hello',
      isFinal: true,
    });

    expect(context.store.setVoiceTranscriptDiagnostics).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantTextFallbackCount: 1,
        lastAssistantTextFallbackReason: 'missing-output-transcript',
      }),
    );
    expect(context.store.setVoiceTranscriptDiagnostics).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTranscriptCount: 1,
        lastInputTranscriptAt: expect.any(String),
      }),
    );
    expect(context.store.setVoiceTranscriptDiagnostics).toHaveBeenCalledWith(
      expect.objectContaining({
        outputTranscriptCount: 1,
        lastOutputTranscriptAt: expect.any(String),
      }),
    );
  });

  it('promotes ignored output counts to store via updateVoiceLiveSignalDiagnostics', () => {
    const context = createMockContext();
    context.ops.currentVoiceSessionStatus.mockReturnValue('recovering');

    handleTransportTurnEvent(context as never, { type: 'text-delta', text: 'stale' });

    expect(context.ops.updateVoiceLiveSignalDiagnostics).toHaveBeenCalledWith(
      expect.objectContaining({
        ignoredOutputTotalCount: 1,
        ignoredTextDeltaCount: 1,
        lastIgnoredReason: 'turn-unavailable',
        lastIgnoredEventType: 'text-delta',
        lastIgnoredVoiceStatus: 'recovering',
      }),
    );
  });

  it('counts input transcripts and records timestamp', () => {
    const context = createMockContext();

    handleTransportTurnEvent(context as never, {
      type: 'input-transcript',
      text: 'hello',
      isFinal: true,
    });

    expect(context.ops.applyVoiceTranscriptUpdate).toHaveBeenCalledWith('user', 'hello', true);
    expect(context.ops.updateVoiceLiveSignalDiagnostics).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTranscriptCount: 1,
        lastInputTranscriptAt: expect.any(String),
      }),
    );
  });

  it('counts output transcripts and records timestamp', () => {
    const context = createMockContext();

    handleTransportTurnEvent(context as never, {
      type: 'output-transcript',
      text: 'I heard you',
      isFinal: false,
    });

    expect(context.ops.applyVoiceTranscriptUpdate).toHaveBeenCalledWith('assistant', 'I heard you', false);
    expect(context.ops.updateVoiceLiveSignalDiagnostics).toHaveBeenCalledWith(
      expect.objectContaining({
        outputTranscriptCount: 1,
        lastOutputTranscriptAt: expect.any(String),
      }),
    );
  });

  it('counts text-delta in voice mode as assistant text fallback', () => {
    const context = createMockContext();
    // Voice mode: status is 'active' (not 'disconnected').
    context.ops.currentVoiceSessionStatus.mockReturnValue('active');

    handleTransportTurnEvent(context as never, { type: 'text-delta', text: 'voice reply' });

    expect(context.ops.appendAssistantDraftTextDelta).toHaveBeenCalledWith('voice reply');
    expect(context.ops.updateVoiceLiveSignalDiagnostics).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantTextFallbackCount: 1,
        lastAssistantTextFallbackAt: expect.any(String),
      }),
    );
  });

  it('does not count text-delta as voice fallback when voice is stopping', () => {
    const context = createMockContext();
    // 'stopping' is an unavailable status — text-delta is gated and never reaches the fallback counter.
    context.ops.currentVoiceSessionStatus.mockReturnValue('stopping');

    handleTransportTurnEvent(context as never, { type: 'text-delta', text: 'stale' });

    // Event is gated by shouldIgnoreCanonicalAssistantOutput before fallback counting.
    expect(context.ops.appendAssistantDraftTextDelta).not.toHaveBeenCalled();
    const calls = context.ops.updateVoiceLiveSignalDiagnostics.mock.calls;
    const hasFallbackUpdate = calls.some(
      (args: unknown[]) => 'assistantTextFallbackCount' in (args[0] as Record<string, unknown>),
    );
    expect(hasFallbackUpdate).toBe(false);
  });
});
