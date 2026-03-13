import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDesktopStores } from '../../../store/testing';
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

  it('stores user transcript updates in the compatibility transcript store and transcript artifacts', () => {
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
  it('passes transcript finality through to the transcript artifact state', () => {
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
        transcriptFinal: true,
      }),
    ]);
  });

  it('skips transcript writes when text and finality are unchanged', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.applyTranscriptUpdate('user', 'hello');
    const firstArtifacts = useSessionStore.getState().transcriptArtifacts;

    ctrl.applyTranscriptUpdate('user', 'hello');

    expect(useSessionStore.getState().transcriptArtifacts).toBe(firstArtifacts);
    expect(useSessionStore.getState().transcriptArtifacts).toHaveLength(1);
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
    expect(useSessionStore.getState().transcriptArtifacts).toEqual([]);
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
    expect(useSessionStore.getState().transcriptArtifacts).toEqual([]);
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

  it('starts a fresh transcript artifact when a new user turn begins after completion', () => {
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
    expect(useSessionStore.getState().transcriptArtifacts).toEqual([
      expect.objectContaining({
        id: 'user-transcript-2',
        content: 'second turn',
        state: 'streaming',
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
        id: 'assistant-transcript-2',
        content: 'typed reply',
        state: 'streaming',
      }),
    ]);
  });

  it('removes linked completed assistant transcript artifacts and ignores late transcript updates for the settled turn', () => {
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
    expect(useSessionStore.getState().transcriptArtifacts).toEqual([]);
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
    expect(useSessionStore.getState().transcriptArtifacts).toEqual([]);
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
});
