import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDesktopStores } from '../../../test/store';
import { useSessionStore } from '../../../store/sessionStore';
import {
  appendCompletedAssistantTurn,
  appendUserTurn,
  createConversationContext,
} from '../../conversation/conversationTurnManager';
import { createVoiceTranscriptController } from './voiceTranscriptController';

describe('createVoiceTranscriptController', () => {
  beforeEach(() => {
    resetDesktopStores();
  });

  it('shows user transcript updates as a streaming transcript artifact immediately', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.applyTranscriptUpdate('user', 'hello');

    expect(useSessionStore.getState().currentVoiceTranscript.user).toEqual({
      text: 'hello',
    });
    expect(useSessionStore.getState().conversationTurns).toEqual([]);
    expect(useSessionStore.getState().transcriptArtifacts).toEqual([
      expect.objectContaining({
        id: 'user-transcript-1',
        role: 'user',
        content: 'hello',
        state: 'streaming',
        source: 'voice',
      }),
    ]);
  });

  it('stores assistant transcript updates separately from canonical assistant turns', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.ensureAssistantTurn();
    ctrl.applyTranscriptUpdate('assistant', 'hi');
    ctrl.applyTranscriptUpdate('assistant', 'hi there');

    expect(useSessionStore.getState().currentVoiceTranscript.assistant).toEqual({
      text: 'hi there',
    });
    expect(useSessionStore.getState().conversationTurns).toEqual([]);
    expect(useSessionStore.getState().transcriptArtifacts).toEqual([
      expect.objectContaining({
        id: 'assistant-transcript-1',
        role: 'assistant',
        content: 'hi there',
        state: 'streaming',
        source: 'voice',
      }),
    ]);
  });

  it('labels a streaming assistant transcript artifact as Speaking to reflect live audio, not text generation', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.ensureAssistantTurn();
    ctrl.applyTranscriptUpdate('assistant', 'partial spoken text');

    expect(useSessionStore.getState().transcriptArtifacts).toEqual([
      expect.objectContaining({
        id: 'assistant-transcript-1',
        state: 'streaming',
        statusLabel: 'Speaking...',
      }),
    ]);
  });
  it('stores transcript finality and shows the user transcript artifact immediately', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.applyTranscriptUpdate('user', 'done', true);

    expect(useSessionStore.getState().currentVoiceTranscript.user).toEqual({
      text: 'done',
      isFinal: true,
    });
    expect(useSessionStore.getState().transcriptArtifacts).toEqual([
      expect.objectContaining({
        id: 'user-transcript-1',
        role: 'user',
        content: 'done',
        state: 'streaming',
        source: 'voice',
      }),
    ]);
  });

  it('skips internal buffer writes when user text and finality are unchanged', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.applyTranscriptUpdate('user', 'hello');
    const firstTranscript = useSessionStore.getState().currentVoiceTranscript;

    ctrl.applyTranscriptUpdate('user', 'hello');

    expect(useSessionStore.getState().currentVoiceTranscript).toBe(firstTranscript);
    // Artifact created on first update, but no duplicate on second.
    expect(useSessionStore.getState().transcriptArtifacts).toEqual([
      expect.objectContaining({
        id: 'user-transcript-1',
        role: 'user',
        content: 'hello',
      }),
    ]);
  });

  it('creates a canonical voice user turn only when the turn settles', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const onConversationTurnSettled = vi.fn();
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx, {
      onConversationTurnSettled,
    });

    ctrl.applyTranscriptUpdate('user', 'Only the user spoke', true);
    ctrl.finalizeCurrentVoiceTurns('completed');

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'user-turn-1',
        role: 'user',
        content: 'Only the user spoke',
        state: 'complete',
        source: 'voice',
      }),
    ]);
    expect(useSessionStore.getState().transcriptArtifacts).toEqual([
      expect.objectContaining({
        id: 'user-transcript-1',
        state: 'complete',
        attachedTurnId: 'user-turn-1',
      }),
    ]);
    expect(onConversationTurnSettled).toHaveBeenCalledWith('user-turn-1');
  });

  it('links a completed assistant transcript artifact to a canonical assistant turn without making transcript text canonical', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.ensureAssistantTurn();
    ctrl.applyTranscriptUpdate('assistant', 'Transcript bubble reply');

    const canonicalAssistantTurnId = appendCompletedAssistantTurn(conversationCtx, 'Canonical reply', {
      source: 'voice',
    });

    ctrl.finalizeCurrentVoiceTurns('completed', {
      assistantTurnId: canonicalAssistantTurnId,
    });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'assistant-turn-1',
        role: 'assistant',
        content: 'Canonical reply',
        source: 'voice',
      }),
    ]);
    expect(useSessionStore.getState().transcriptArtifacts).toEqual([
      expect.objectContaining({
        id: 'assistant-transcript-1',
        state: 'complete',
        attachedTurnId: 'assistant-turn-1',
      }),
    ]);
  });

  it('keeps interrupted assistant transcript output visible as an artifact without creating a canonical assistant turn', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.ensureAssistantTurn();
    ctrl.applyTranscriptUpdate('assistant', 'Partial answer');
    ctrl.finalizeCurrentVoiceTurns('interrupted');

    expect(useSessionStore.getState().conversationTurns).toEqual([]);
    expect(useSessionStore.getState().transcriptArtifacts).toEqual([
      expect.objectContaining({
        id: 'assistant-transcript-1',
        content: 'Partial answer',
        state: 'complete',
        statusLabel: 'Interrupted',
        source: 'voice',
      }),
    ]);
  });

  it('ignores late assistant transcript corrections after interruption fences the turn', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.ensureAssistantTurn();
    ctrl.applyTranscriptUpdate('assistant', 'Partial answer');
    ctrl.finalizeCurrentVoiceTurns('interrupted');

    ctrl.applyTranscriptUpdate('assistant', 'Partial answer corrected');

    expect(useSessionStore.getState().transcriptArtifacts).toEqual([
      expect.objectContaining({
        id: 'assistant-transcript-1',
        content: 'Partial answer',
        state: 'complete',
        statusLabel: 'Interrupted',
      }),
    ]);
  });

  it('starts a fresh buffer and shows a new user transcript artifact when a new turn begins after completion', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.applyTranscriptUpdate('user', 'first turn', true);
    ctrl.finalizeCurrentVoiceTurns('completed');
    ctrl.applyTranscriptUpdate('user', 'second turn');

    expect(useSessionStore.getState().currentVoiceTranscript).toEqual({
      user: { text: 'second turn' },
      assistant: { text: '' },
    });
    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'user-turn-1',
        content: 'first turn',
        state: 'complete',
      }),
    ]);
    // The first turn's artifact remains with attachedTurnId; the new user
    // transcript is visible immediately as a streaming artifact.
    expect(useSessionStore.getState().transcriptArtifacts).toEqual([
      expect.objectContaining({
        id: 'user-transcript-1',
        state: 'complete',
        attachedTurnId: 'user-turn-1',
      }),
      expect.objectContaining({
        id: 'user-transcript-2',
        role: 'user',
        content: 'second turn',
        state: 'streaming',
        source: 'voice',
      }),
    ]);
  });

  it('allows the next assistant reply to reopen after a duplicate settled user transcript replay', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const logRuntimeDiagnostic = vi.fn();
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx, {
      logRuntimeDiagnostic,
    });

    ctrl.applyTranscriptUpdate('user', 'same phrase', true);
    ctrl.finalizeCurrentVoiceTurns('completed');

    // Gemini can replay the settled user transcript before the next assistant
    // packets arrive. That replay must not leave the prior completed fence in
    // place and block the next assistant turn from opening.
    ctrl.applyTranscriptUpdate('user', 'same phrase');

    expect(ctrl.ensureAssistantTurn()).toBe(true);

    ctrl.applyTranscriptUpdate('assistant', 'next assistant reply');

    expect(logRuntimeDiagnostic).toHaveBeenCalledWith(
      'voice-session',
      'reopened settled voice turn after user transcript replay',
      expect.objectContaining({
        previousTurnState: 'completed',
        replayedSettledTranscript: true,
      }),
    );
    expect(useSessionStore.getState().currentVoiceTranscript.assistant).toEqual({
      text: 'next assistant reply',
    });
    expect(useSessionStore.getState().transcriptArtifacts).toEqual([
      expect.objectContaining({
        id: 'user-transcript-1',
        role: 'user',
        content: 'same phrase',
        state: 'complete',
        attachedTurnId: 'user-turn-1',
      }),
      expect.objectContaining({
        id: 'assistant-transcript-2',
        role: 'assistant',
        content: 'next assistant reply',
        state: 'streaming',
        source: 'voice',
      }),
    ]);
  });

  it('routes a mixed-mode typed follow-up reply onto a fresh assistant transcript artifact below the typed user turn', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.applyTranscriptUpdate('user', 'spoken request', true);
    ctrl.finalizeCurrentVoiceTurns('completed');

    appendUserTurn(conversationCtx, 'typed follow-up');
    ctrl.queueMixedModeAssistantReply();
    ctrl.ensureAssistantTurn();
    ctrl.applyTranscriptUpdate('assistant', 'typed reply');

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'user-turn-1',
        content: 'spoken request',
        state: 'complete',
        source: 'voice',
      }),
      expect.objectContaining({
        id: 'user-turn-2',
        content: 'typed follow-up',
        state: 'complete',
      }),
    ]);
    expect(useSessionStore.getState().transcriptArtifacts).toEqual([
      expect.objectContaining({
        id: 'user-transcript-1',
        state: 'complete',
        attachedTurnId: 'user-turn-1',
      }),
      expect.objectContaining({
        id: 'assistant-transcript-2',
        content: 'typed reply',
        state: 'streaming',
      }),
    ]);
  });

  it('retains linked completed assistant transcript artifacts and ignores late transcript updates for the settled turn', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.ensureAssistantTurn();
    ctrl.applyTranscriptUpdate('assistant', 'Transcript bubble reply');

    const canonicalAssistantTurnId = appendCompletedAssistantTurn(conversationCtx, 'Canonical reply', {
      source: 'voice',
    });

    ctrl.finalizeCurrentVoiceTurns('completed');
    ctrl.attachCurrentAssistantTurn(canonicalAssistantTurnId);
    ctrl.applyTranscriptUpdate('assistant', 'late correction');

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'assistant-turn-1',
        content: 'Canonical reply',
      }),
    ]);
    expect(useSessionStore.getState().transcriptArtifacts).toEqual([
      expect.objectContaining({
        id: 'assistant-transcript-1',
        state: 'complete',
        attachedTurnId: 'assistant-turn-1',
      }),
    ]);
  });

  it('treats duplicate completed finalization as idempotent for user turns', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const onConversationTurnSettled = vi.fn();
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx, {
      onConversationTurnSettled,
    });

    ctrl.applyTranscriptUpdate('user', 'Only the user spoke', true);
    ctrl.finalizeCurrentVoiceTurns('completed');
    ctrl.finalizeCurrentVoiceTurns('completed');

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'user-turn-1',
        content: 'Only the user spoke',
      }),
    ]);
    expect(useSessionStore.getState().transcriptArtifacts).toEqual([
      expect.objectContaining({
        id: 'user-transcript-1',
        state: 'complete',
        attachedTurnId: 'user-turn-1',
      }),
    ]);
    expect(onConversationTurnSettled).toHaveBeenCalledTimes(1);
  });

  it('resetTurnTranscriptState clears transcript state and active artifact references', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.applyTranscriptUpdate('user', 'new input');
    ctrl.ensureAssistantTurn();

    ctrl.resetTurnTranscriptState();

    expect(useSessionStore.getState().currentVoiceTranscript).toEqual({
      user: { text: '' },
      assistant: { text: '' },
    });
    expect(conversationCtx.currentVoiceUserArtifactId).toBeNull();
    expect(conversationCtx.currentVoiceAssistantArtifactId).toBeNull();
  });

  it('creates and updates a single visible user transcript artifact during progressive speech partials', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.applyTranscriptUpdate('user', 'Hello');
    ctrl.applyTranscriptUpdate('user', 'Hello there');
    ctrl.applyTranscriptUpdate('user', 'Hello there, how are you');

    expect(useSessionStore.getState().transcriptArtifacts).toEqual([
      expect.objectContaining({
        id: 'user-transcript-1',
        role: 'user',
        content: 'Hello there, how are you',
        state: 'streaming',
        source: 'voice',
      }),
    ]);
    expect(useSessionStore.getState().currentVoiceTranscript.user).toEqual({
      text: 'Hello there, how are you',
    });
  });

  it('materializes exactly one user message on turn finalization with the completed utterance', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.applyTranscriptUpdate('user', 'Hello');
    ctrl.applyTranscriptUpdate('user', 'Hello there');
    ctrl.applyTranscriptUpdate('user', 'Hello there, how are you');
    ctrl.finalizeCurrentVoiceTurns('completed');

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'user-turn-1',
        role: 'user',
        content: 'Hello there, how are you',
        state: 'complete',
        source: 'voice',
      }),
    ]);
  });

  it('preserves correct chronology: user turn appears before assistant turn on finalization', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.applyTranscriptUpdate('user', 'user question');
    ctrl.ensureAssistantTurn();
    ctrl.applyTranscriptUpdate('assistant', 'assistant answer');

    // Matches the real turn-complete handler order: finalize first, then commit assistant
    ctrl.finalizeCurrentVoiceTurns('completed');

    const canonicalAssistantTurnId = appendCompletedAssistantTurn(conversationCtx, 'Canonical answer', {
      source: 'voice',
    });
    ctrl.attachCurrentAssistantTurn(canonicalAssistantTurnId);

    const turns = useSessionStore.getState().conversationTurns;
    expect(turns).toHaveLength(2);
    expect(turns[0]).toEqual(expect.objectContaining({
      id: 'user-turn-1',
      role: 'user',
      content: 'user question',
    }));
    expect(turns[1]).toEqual(expect.objectContaining({
      id: 'assistant-turn-1',
      role: 'assistant',
      content: 'Canonical answer',
    }));
  });

  it('does not produce duplicate user messages on repeated finalization', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const onConversationTurnSettled = vi.fn();
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx, {
      onConversationTurnSettled,
    });

    ctrl.applyTranscriptUpdate('user', 'single utterance');
    ctrl.finalizeCurrentVoiceTurns('completed');
    ctrl.finalizeCurrentVoiceTurns('completed');

    const userTurns = useSessionStore.getState().conversationTurns.filter((t) => t.role === 'user');
    expect(userTurns).toHaveLength(1);
    expect(userTurns[0]).toEqual(expect.objectContaining({
      content: 'single utterance',
    }));
    expect(onConversationTurnSettled).toHaveBeenCalledTimes(1);
  });

  it('resetTurnTranscriptState salvages internal user transcript when no artifact exists', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const onConversationTurnSettled = vi.fn();
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx, {
      onConversationTurnSettled,
    });

    ctrl.applyTranscriptUpdate('user', 'interrupted speech');

    ctrl.resetTurnTranscriptState();

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'user-turn-1',
        role: 'user',
        content: 'interrupted speech',
        state: 'complete',
        source: 'voice',
      }),
    ]);
    expect(onConversationTurnSettled).toHaveBeenCalledWith('user-turn-1');
    expect(useSessionStore.getState().currentVoiceTranscript).toEqual({
      user: { text: '' },
      assistant: { text: '' },
    });
  });
});
