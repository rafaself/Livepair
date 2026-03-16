import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('createVoiceTranscriptController facade', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('./voiceTranscriptTurnState');
    vi.doUnmock('./voiceTranscriptStoreSync');
    vi.doUnmock('./voiceTranscriptLifecycle');
  });

  it('delegates transcript responsibilities to extracted internal modules', async () => {
    const ensureAssistantTurn = vi.fn(() => true);
    const queueMixedModeAssistantReply = vi.fn();
    const clearQueuedMixedModeAssistantReply = vi.fn();
    const resetTurnCompletedFlag = vi.fn();
    const attachCurrentAssistantTurn = vi.fn();
    const currentAssistantArtifact = vi.fn(() => null);
    const currentUserArtifact = vi.fn(() => null);
    const hasSettledTurnFence = vi.fn(() => false);
    const applyTranscriptUpdate = vi.fn();
    const finalizeCurrentVoiceTurns = vi.fn();
    const resetTurnTranscriptState = vi.fn();

    const createVoiceTranscriptTurnState = vi.fn(() => ({
      ensureAssistantTurn,
      queueMixedModeAssistantReply,
      clearQueuedMixedModeAssistantReply,
      resetTurnCompletedFlag,
      attachCurrentAssistantTurn,
      currentAssistantArtifact,
      currentUserArtifact,
      hasSettledTurnFence,
    }));
    const createVoiceTranscriptStoreSync = vi.fn(() => ({
      applyTranscriptUpdate,
    }));
    const createVoiceTranscriptLifecycle = vi.fn(() => ({
      finalizeCurrentVoiceTurns,
      resetTurnTranscriptState,
    }));

    vi.doMock('./voiceTranscriptTurnState', () => ({
      createVoiceTranscriptTurnState,
    }));
    vi.doMock('./voiceTranscriptStoreSync', () => ({
      createVoiceTranscriptStoreSync,
    }));
    vi.doMock('./voiceTranscriptLifecycle', () => ({
      createVoiceTranscriptLifecycle,
    }));

    const { createVoiceTranscriptController } = await import('./voiceTranscriptController');

    const clearCurrentVoiceTranscript = vi.fn();
    const store = {
      getState: () => ({
        currentVoiceTranscript: {
          user: { text: '' },
          assistant: { text: '' },
        },
        setCurrentVoiceTranscriptEntry: vi.fn(),
        setVoiceSessionRecoveryDiagnostics: vi.fn(),
        clearCurrentVoiceTranscript,
        conversationTurns: [],
        transcriptArtifacts: [],
      }),
    };
    const conversationCtx = {} as never;
    const onConversationTurnSettled = vi.fn();

    const controller = createVoiceTranscriptController(store, conversationCtx, {
      onConversationTurnSettled,
    });

    expect(createVoiceTranscriptTurnState).toHaveBeenCalledWith({
      store,
      conversationCtx,
    });
    expect(createVoiceTranscriptStoreSync).toHaveBeenCalledWith({
      store,
      conversationCtx,
      clearTranscript: expect.any(Function),
      ensureAssistantTurn,
      hasSettledTurnFence,
    });
    expect(createVoiceTranscriptLifecycle).toHaveBeenCalledWith({
      store,
      conversationCtx,
      clearTranscript: expect.any(Function),
      currentAssistantArtifact,
      currentUserArtifact,
      onConversationTurnSettled,
    });

    controller.applyTranscriptUpdate('assistant', 'hello');
    controller.ensureAssistantTurn();
    controller.finalizeCurrentVoiceTurns('completed');
    controller.attachCurrentAssistantTurn('assistant-turn-1');
    controller.queueMixedModeAssistantReply();
    controller.clearQueuedMixedModeAssistantReply();
    controller.resetTurnTranscriptState();
    controller.clearTranscript();
    controller.resetTurnCompletedFlag();

    expect(applyTranscriptUpdate).toHaveBeenCalledWith('assistant', 'hello');
    expect(ensureAssistantTurn).toHaveBeenCalled();
    expect(finalizeCurrentVoiceTurns).toHaveBeenCalledWith('completed');
    expect(attachCurrentAssistantTurn).toHaveBeenCalledWith('assistant-turn-1');
    expect(queueMixedModeAssistantReply).toHaveBeenCalled();
    expect(clearQueuedMixedModeAssistantReply).toHaveBeenCalled();
    expect(resetTurnTranscriptState).toHaveBeenCalled();
    expect(clearCurrentVoiceTranscript).toHaveBeenCalled();
    expect(resetTurnCompletedFlag).toHaveBeenCalled();
  });
});
