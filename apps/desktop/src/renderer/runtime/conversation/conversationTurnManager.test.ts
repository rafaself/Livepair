import { beforeEach, describe, expect, it } from 'vitest';
import { resetDesktopStores } from '../../test/store';
import { useSessionStore } from '../../store/sessionStore';
import {
  appendAssistantDraftTextDelta,
  appendAssistantTurn,
  appendCompletedAssistantTurn,
  appendUserTurn,
  clearAssistantDraft,
  clearCurrentVoiceTurns,
  clearPendingAssistantTurn,
  completeAssistantDraft,
  completePendingAssistantTurn,
  createConversationContext,
  failPendingAssistantTurn,
  finalizeCurrentVoiceAssistantTranscriptArtifact,
  finalizeCurrentVoiceUserTranscriptArtifact,
  getConversationTurn,
  getTranscriptArtifact,
  interruptAssistantDraft,
  interruptCurrentVoiceAssistantTranscriptArtifact,
  type ConversationContext,
  upsertCurrentVoiceAssistantTranscriptArtifact,
  upsertCurrentVoiceUserTranscriptArtifact,
  updatePendingAssistantTurn,
} from './conversationTurnManager';

describe('conversationTurnManager', () => {
  let ctx: ConversationContext;

  beforeEach(() => {
    resetDesktopStores();
    ctx = createConversationContext(useSessionStore);
  });

  describe('createConversationContext', () => {
    it('initializes canonical and transcript tracking independently', () => {
      expect(ctx.pendingAssistantTurnId).toBeNull();
      expect(ctx.assistantDraft).toBeNull();
      expect(ctx.currentVoiceAssistantArtifactId).toBeNull();
      expect(ctx.currentVoiceUserArtifactId).toBeNull();
      expect(ctx.nextAssistantTurnId).toBe(0);
      expect(ctx.nextUserTurnId).toBe(0);
      expect(ctx.nextTranscriptArtifactId).toBe(0);
    });
  });

  describe('appendUserTurn', () => {
    it('appends a canonical user turn with incremented id', () => {
      appendUserTurn(ctx, 'Hello');

      expect(useSessionStore.getState().conversationTurns).toEqual([
        expect.objectContaining({
          id: 'user-turn-1',
          role: 'user',
          content: 'Hello',
          state: 'complete',
        }),
      ]);
      expect(ctx.nextUserTurnId).toBe(1);
    });

    it('can mark a canonical voice user turn distinctly from transcript artifacts', () => {
      appendUserTurn(ctx, 'Spoken request', {
        source: 'voice',
        transcriptFinal: true,
        persistedMessageId: 'message-7',
      });

      expect(useSessionStore.getState().conversationTurns).toEqual([
        expect.objectContaining({
          id: 'user-turn-1',
          source: 'voice',
          transcriptFinal: true,
          persistedMessageId: 'message-7',
        }),
      ]);
    });
  });

  describe('voice transcript artifact lifecycle', () => {
    it('stores user transcript artifacts separately from canonical conversation turns', () => {
      upsertCurrentVoiceUserTranscriptArtifact(ctx, 'Hello', false);
      upsertCurrentVoiceUserTranscriptArtifact(ctx, 'Hello there', true);

      expect(useSessionStore.getState().conversationTurns).toEqual([]);
      expect(useSessionStore.getState().transcriptArtifacts).toEqual([
        expect.objectContaining({
          id: 'user-transcript-1',
          role: 'user',
          content: 'Hello there',
          state: 'streaming',
          transcriptFinal: true,
          source: 'voice',
        }),
      ]);
      expect(ctx.currentVoiceUserArtifactId).toBe('user-transcript-1');
    });

    it('attaches a finalized user transcript artifact to a canonical user turn', () => {
      upsertCurrentVoiceUserTranscriptArtifact(ctx, 'Only the user spoke', true);
      const userTurnId = appendUserTurn(ctx, 'Only the user spoke', {
        source: 'voice',
        transcriptFinal: true,
      });

      finalizeCurrentVoiceUserTranscriptArtifact(ctx, userTurnId);

      expect(getTranscriptArtifact(ctx, 'user-transcript-1')).toEqual(
        expect.objectContaining({
          id: 'user-transcript-1',
          state: 'complete',
          attachedTurnId: 'user-turn-1',
        }),
      );
      expect(useSessionStore.getState().conversationTurns).toEqual([
        expect.objectContaining({
          id: 'user-turn-1',
          role: 'user',
          content: 'Only the user spoke',
          source: 'voice',
        }),
      ]);
    });

    it('keeps interrupted assistant transcript artifacts separate from canonical assistant turns', () => {
      upsertCurrentVoiceAssistantTranscriptArtifact(ctx, 'Partial answer');

      interruptCurrentVoiceAssistantTranscriptArtifact(ctx);
      finalizeCurrentVoiceAssistantTranscriptArtifact(ctx, { interrupted: true });

      expect(useSessionStore.getState().conversationTurns).toEqual([]);
      expect(useSessionStore.getState().transcriptArtifacts).toEqual([
        expect.objectContaining({
          id: 'assistant-transcript-1',
          role: 'assistant',
          content: 'Partial answer',
          state: 'complete',
          statusLabel: 'Interrupted',
          source: 'voice',
        }),
      ]);
    });

    it('links completed assistant transcript artifacts to a separately created canonical assistant turn', () => {
      upsertCurrentVoiceAssistantTranscriptArtifact(ctx, 'Transcript bubble reply', true);
      const assistantTurnId = appendCompletedAssistantTurn(ctx, 'Canonical reply', {
        source: 'voice',
      });

      finalizeCurrentVoiceAssistantTranscriptArtifact(
        ctx,
        assistantTurnId ? { attachedTurnId: assistantTurnId } : {},
      );

      expect(getTranscriptArtifact(ctx, 'assistant-transcript-1')).toEqual(
        expect.objectContaining({
          id: 'assistant-transcript-1',
          state: 'complete',
          attachedTurnId: 'assistant-turn-1',
        }),
      );
      expect(useSessionStore.getState().conversationTurns).toEqual([
        expect.objectContaining({
          id: 'assistant-turn-1',
          role: 'assistant',
          content: 'Canonical reply',
          source: 'voice',
        }),
      ]);
    });

    it('removes an empty assistant placeholder transcript artifact when finalized', () => {
      upsertCurrentVoiceAssistantTranscriptArtifact(ctx, '');

      finalizeCurrentVoiceAssistantTranscriptArtifact(ctx);

      expect(useSessionStore.getState().transcriptArtifacts).toEqual([]);
      expect(ctx.currentVoiceAssistantArtifactId).toBeNull();
    });
  });

  describe('clearCurrentVoiceTurns', () => {
    it('clears active artifact references without deleting stored transcript records', () => {
      upsertCurrentVoiceUserTranscriptArtifact(ctx, 'Voice request', true);
      upsertCurrentVoiceAssistantTranscriptArtifact(ctx, 'Voice reply', true);

      clearCurrentVoiceTurns(ctx);

      expect(ctx.currentVoiceUserArtifactId).toBeNull();
      expect(ctx.currentVoiceAssistantArtifactId).toBeNull();
      expect(useSessionStore.getState().transcriptArtifacts).toEqual([
        expect.objectContaining({ id: 'user-transcript-1' }),
        expect.objectContaining({ id: 'assistant-transcript-2' }),
      ]);
    });
  });

  describe('appendAssistantTurn', () => {
    it('appends a canonical assistant turn and sets pendingAssistantTurnId', () => {
      appendAssistantTurn(ctx, 'Response', 'streaming', 'Responding...');

      expect(useSessionStore.getState().conversationTurns).toEqual([
        expect.objectContaining({
          id: 'assistant-turn-1',
          role: 'assistant',
          content: 'Response',
          state: 'streaming',
          statusLabel: 'Responding...',
        }),
      ]);
      expect(ctx.pendingAssistantTurnId).toBe('assistant-turn-1');
    });
  });

  describe('appendCompletedAssistantTurn', () => {
    it('appends a completed assistant turn without setting a pending id', () => {
      const turnId = appendCompletedAssistantTurn(ctx, 'Final answer', {
        source: 'voice',
      });

      expect(turnId).toBe('assistant-turn-1');
      expect(useSessionStore.getState().conversationTurns).toEqual([
        expect.objectContaining({
          id: 'assistant-turn-1',
          role: 'assistant',
          content: 'Final answer',
          state: 'complete',
          source: 'voice',
        }),
      ]);
      expect(ctx.pendingAssistantTurnId).toBeNull();
    });

    it('ignores empty assistant content', () => {
      expect(appendCompletedAssistantTurn(ctx, '   ')).toBeNull();
      expect(useSessionStore.getState().conversationTurns).toEqual([]);
    });
  });

  describe('updatePendingAssistantTurn', () => {
    it('does nothing when no pending turn exists', () => {
      updatePendingAssistantTurn(ctx, 'content', 'streaming');
      expect(useSessionStore.getState().conversationTurns).toHaveLength(0);
    });

    it('updates the active pending assistant turn in place', () => {
      appendAssistantTurn(ctx, 'Draft', 'streaming', 'Responding...');

      updatePendingAssistantTurn(ctx, 'Draft updated', 'complete');

      expect(useSessionStore.getState().conversationTurns).toEqual([
        expect.objectContaining({
          id: 'assistant-turn-1',
          content: 'Draft updated',
          state: 'complete',
        }),
      ]);
    });
  });

  describe('assistant draft lifecycle', () => {
    it('creates, completes, interrupts, and clears the assistant draft', () => {
      appendAssistantDraftTextDelta(ctx, 'Canon');
      appendAssistantDraftTextDelta(ctx, 'ical');

      expect(ctx.assistantDraft).toEqual({
        id: 'assistant-draft-1',
        role: 'assistant',
        content: 'Canonical',
        status: 'streaming',
      });

      completeAssistantDraft(ctx);
      expect(ctx.assistantDraft?.status).toBe('complete');

      interruptAssistantDraft(ctx);
      expect(ctx.assistantDraft?.status).toBe('interrupted');

      clearAssistantDraft(ctx);
      expect(ctx.assistantDraft).toBeNull();
    });
  });

  describe('completePendingAssistantTurn', () => {
    it('returns null when no pending turn exists', () => {
      expect(completePendingAssistantTurn(ctx)).toBeNull();
    });

    it('marks the pending assistant turn complete and clears the pending id', () => {
      appendAssistantTurn(ctx, 'Draft', 'streaming');

      expect(completePendingAssistantTurn(ctx)).toBe('assistant-turn-1');
      expect(ctx.pendingAssistantTurnId).toBeNull();
      expect(useSessionStore.getState().conversationTurns).toEqual([
        expect.objectContaining({
          id: 'assistant-turn-1',
          state: 'complete',
        }),
      ]);
    });
  });

  describe('failPendingAssistantTurn', () => {
    it('returns null when no pending turn exists', () => {
      expect(failPendingAssistantTurn(ctx, 'failed')).toBeNull();
    });

    it('marks the pending assistant turn errored and clears the pending id', () => {
      appendAssistantTurn(ctx, 'Draft', 'streaming');

      expect(failPendingAssistantTurn(ctx, 'failed')).toBe('assistant-turn-1');
      expect(ctx.pendingAssistantTurnId).toBeNull();
      expect(useSessionStore.getState().conversationTurns).toEqual([
        expect.objectContaining({
          id: 'assistant-turn-1',
          state: 'error',
          statusLabel: 'failed',
        }),
      ]);
    });
  });

  describe('clearPendingAssistantTurn', () => {
    it('clears both pending assistant turn and assistant draft', () => {
      appendAssistantTurn(ctx, 'Draft', 'streaming');
      appendAssistantDraftTextDelta(ctx, 'Canonical');

      clearPendingAssistantTurn(ctx);

      expect(ctx.pendingAssistantTurnId).toBeNull();
      expect(ctx.assistantDraft).toBeNull();
    });
  });

  describe('getConversationTurn', () => {
    it('returns the matching canonical conversation turn when present', () => {
      appendUserTurn(ctx, 'Hello');

      expect(getConversationTurn(ctx, 'user-turn-1')).toEqual(
        expect.objectContaining({
          id: 'user-turn-1',
          content: 'Hello',
        }),
      );
    });

    it('returns undefined when the canonical turn does not exist', () => {
      expect(getConversationTurn(ctx, 'missing-turn')).toBeUndefined();
    });
  });
});
