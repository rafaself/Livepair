import { describe, expect, it, vi } from 'vitest';
import { handleTransportTurnEvent } from './transportEventRouterTurnHandlers';

function createMockContext() {
  const store = {
    setLastRuntimeError: vi.fn(),
  };

  const ops = {
    logRuntimeDiagnostic: vi.fn(),
    currentVoiceSessionStatus: vi.fn().mockReturnValue('ready'),
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
});
