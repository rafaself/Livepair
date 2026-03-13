import { beforeEach, describe, expect, it } from 'vitest';
import { useSessionStore } from '../../store/sessionStore';
import {
  appendCompletedAssistantTurn,
  appendAssistantTextDelta,
  appendAssistantTurn,
  appendUserTurn,
  clearCurrentVoiceTurns,
  clearPendingAssistantTurn,
  completePendingAssistantTurn,
  createConversationContext,
  failPendingAssistantTurn,
  finalizeCurrentVoiceAssistantTurn,
  finalizeCurrentVoiceUserTurn,
  getConversationTurn,
  interruptCurrentVoiceAssistantTurn,
  upsertCurrentVoiceAssistantTurn,
  upsertCurrentVoiceUserTurn,
  updatePendingAssistantTurn,
  type ConversationContext,
} from './conversationTurnManager';

describe('conversationTurnManager', () => {
  let ctx: ConversationContext;

  beforeEach(() => {
    useSessionStore.getState().reset();
    ctx = createConversationContext(useSessionStore);
  });

  describe('createConversationContext', () => {
    it('initializes with null pending turn and zero counters', () => {
      expect(ctx.pendingAssistantTurnId).toBeNull();
      expect(ctx.currentVoiceAssistantTurnId).toBeNull();
      expect(ctx.currentVoiceUserTurnId).toBeNull();
      expect(ctx.nextAssistantTurnId).toBe(0);
      expect(ctx.nextUserTurnId).toBe(0);
    });
  });

  describe('appendUserTurn', () => {
    it('appends a user turn with incremented id', () => {
      appendUserTurn(ctx, 'Hello');
      const turns = useSessionStore.getState().conversationTurns;
      expect(turns).toHaveLength(1);
      expect(turns[0]).toEqual(
        expect.objectContaining({
          id: 'user-turn-1',
          role: 'user',
          content: 'Hello',
          state: 'complete',
        }),
      );
      expect(ctx.nextUserTurnId).toBe(1);
    });

    it('increments the user turn id on each call', () => {
      appendUserTurn(ctx, 'First');
      appendUserTurn(ctx, 'Second');
      const turns = useSessionStore.getState().conversationTurns;
      expect(turns[0]!.id).toBe('user-turn-1');
      expect(turns[1]!.id).toBe('user-turn-2');
    });

    it('can mark the projected user turn with a persisted message id', () => {
      appendUserTurn(ctx, 'Stored prompt', { persistedMessageId: 'message-7' });

      expect(useSessionStore.getState().conversationTurns).toEqual([
        expect.objectContaining({
          id: 'user-turn-1',
          role: 'user',
          content: 'Stored prompt',
          persistedMessageId: 'message-7',
        }),
      ]);
    });
  });

  describe('voice user turn lifecycle', () => {
    it('creates and updates the same in-progress user voice turn', () => {
      upsertCurrentVoiceUserTurn(ctx, 'Hello', false);

      const firstTurn = useSessionStore.getState().conversationTurns[0];

      expect(firstTurn).toEqual(
        expect.objectContaining({
          id: 'user-turn-1',
          role: 'user',
          content: 'Hello',
          state: 'streaming',
          transcriptFinal: false,
          source: 'voice',
        }),
      );
      expect(ctx.currentVoiceUserTurnId).toBe('user-turn-1');

      upsertCurrentVoiceUserTurn(ctx, 'Hello there', true);

      const updatedTurn = useSessionStore.getState().conversationTurns[0];

      expect(updatedTurn).toEqual(
        expect.objectContaining({
          id: 'user-turn-1',
          content: 'Hello there',
          state: 'streaming',
          transcriptFinal: true,
          source: 'voice',
        }),
      );
      expect(useSessionStore.getState().conversationTurns).toHaveLength(1);
    });

    it('finalizes the current voice user turn in place', () => {
      upsertCurrentVoiceUserTurn(ctx, 'Only the user spoke', true);

      finalizeCurrentVoiceUserTurn(ctx);

      expect(useSessionStore.getState().conversationTurns).toEqual([
        expect.objectContaining({
          id: 'user-turn-1',
          role: 'user',
          content: 'Only the user spoke',
          state: 'complete',
          transcriptFinal: true,
          source: 'voice',
        }),
      ]);
      expect(ctx.currentVoiceUserTurnId).toBe('user-turn-1');
    });
  });

  describe('voice assistant turn lifecycle', () => {
    it('creates an empty in-progress assistant voice turn before transcript text arrives', () => {
      upsertCurrentVoiceAssistantTurn(ctx, '');

      expect(useSessionStore.getState().conversationTurns).toEqual([
        expect.objectContaining({
          id: 'assistant-turn-1',
          role: 'assistant',
          content: '',
          state: 'streaming',
          statusLabel: 'Responding...',
          source: 'voice',
        }),
      ]);
      expect(ctx.currentVoiceAssistantTurnId).toBe('assistant-turn-1');
    });

    it('reconciles assistant transcript updates onto the same voice turn', () => {
      upsertCurrentVoiceAssistantTurn(ctx, 'Hi');
      upsertCurrentVoiceAssistantTurn(ctx, ' there');
      upsertCurrentVoiceAssistantTurn(ctx, 'Hi there, corrected', true);

      expect(useSessionStore.getState().conversationTurns).toEqual([
        expect.objectContaining({
          id: 'assistant-turn-1',
          role: 'assistant',
          content: 'Hi there, corrected',
          state: 'streaming',
          transcriptFinal: true,
          statusLabel: 'Responding...',
          source: 'voice',
        }),
      ]);
    });

    it('finalizes the current assistant voice turn in place', () => {
      upsertCurrentVoiceAssistantTurn(ctx, 'Final answer', true);

      finalizeCurrentVoiceAssistantTurn(ctx);

      expect(useSessionStore.getState().conversationTurns).toEqual([
        expect.objectContaining({
          id: 'assistant-turn-1',
          role: 'assistant',
          content: 'Final answer',
          state: 'complete',
          transcriptFinal: true,
          statusLabel: undefined,
          source: 'voice',
        }),
      ]);
      expect(ctx.currentVoiceAssistantTurnId).toBe('assistant-turn-1');
    });

    it('marks interrupted assistant voice output in place without duplicating the turn', () => {
      upsertCurrentVoiceAssistantTurn(ctx, 'Partial answer');

      interruptCurrentVoiceAssistantTurn(ctx);
      finalizeCurrentVoiceAssistantTurn(ctx);

      expect(useSessionStore.getState().conversationTurns).toEqual([
        expect.objectContaining({
          id: 'assistant-turn-1',
          role: 'assistant',
          content: 'Partial answer',
          state: 'complete',
          statusLabel: 'Interrupted',
          source: 'voice',
        }),
      ]);
      expect(useSessionStore.getState().conversationTurns).toHaveLength(1);
    });

    it('removes an empty assistant placeholder when the voice turn finalizes without transcript text', () => {
      upsertCurrentVoiceAssistantTurn(ctx, '');

      finalizeCurrentVoiceAssistantTurn(ctx);

      expect(useSessionStore.getState().conversationTurns).toEqual([]);
      expect(ctx.currentVoiceAssistantTurnId).toBeNull();
    });
  });

  describe('clearCurrentVoiceTurns', () => {
    it('clears tracked voice turn ids without deleting finalized history', () => {
      upsertCurrentVoiceUserTurn(ctx, 'Voice request', true);
      upsertCurrentVoiceAssistantTurn(ctx, 'Voice reply', true);
      finalizeCurrentVoiceUserTurn(ctx);
      finalizeCurrentVoiceAssistantTurn(ctx);

      clearCurrentVoiceTurns(ctx);

      expect(ctx.currentVoiceUserTurnId).toBeNull();
      expect(ctx.currentVoiceAssistantTurnId).toBeNull();
      expect(useSessionStore.getState().conversationTurns).toEqual([
        expect.objectContaining({ id: 'user-turn-1', state: 'complete' }),
        expect.objectContaining({ id: 'assistant-turn-1', state: 'complete' }),
      ]);
    });
  });

  describe('appendAssistantTurn', () => {
    it('appends an assistant turn and sets pendingAssistantTurnId', () => {
      appendAssistantTurn(ctx, 'Response', 'streaming', 'Responding...');
      const turns = useSessionStore.getState().conversationTurns;
      expect(turns).toHaveLength(1);
      expect(turns[0]).toEqual(
        expect.objectContaining({
          id: 'assistant-turn-1',
          role: 'assistant',
          content: 'Response',
          state: 'streaming',
          statusLabel: 'Responding...',
        }),
      );
      expect(ctx.pendingAssistantTurnId).toBe('assistant-turn-1');
    });
  });

  describe('appendCompletedAssistantTurn', () => {
    it('appends a completed assistant turn without setting a pending id', () => {
      appendCompletedAssistantTurn(ctx, 'Final answer');

      expect(useSessionStore.getState().conversationTurns).toEqual([
        expect.objectContaining({
          id: 'assistant-turn-1',
          role: 'assistant',
          content: 'Final answer',
          state: 'complete',
        }),
      ]);
      expect(ctx.pendingAssistantTurnId).toBeNull();
    });

    it('ignores empty assistant transcript content', () => {
      appendCompletedAssistantTurn(ctx, '   ');
      expect(useSessionStore.getState().conversationTurns).toEqual([]);
    });
  });

  describe('updatePendingAssistantTurn', () => {
    it('does nothing when no pending turn exists', () => {
      updatePendingAssistantTurn(ctx, 'content', 'streaming');
      expect(useSessionStore.getState().conversationTurns).toHaveLength(0);
    });

    it('updates the pending turn content and state', () => {
      appendAssistantTurn(ctx, 'Initial', 'streaming');
      updatePendingAssistantTurn(ctx, 'Updated', 'complete', 'Done');
      const turn = useSessionStore.getState().conversationTurns[0];
      expect(turn).toEqual(
        expect.objectContaining({
          content: 'Updated',
          state: 'complete',
          statusLabel: 'Done',
        }),
      );
    });
  });

  describe('appendAssistantTextDelta', () => {
    it('creates a new streaming turn when no pending turn exists', () => {
      appendAssistantTextDelta(ctx, 'Hello');
      const turns = useSessionStore.getState().conversationTurns;
      expect(turns).toHaveLength(1);
      expect(turns[0]).toEqual(
        expect.objectContaining({
          content: 'Hello',
          state: 'streaming',
          statusLabel: 'Responding...',
        }),
      );
    });

    it('appends to existing pending turn content', () => {
      appendAssistantTextDelta(ctx, 'Hello');
      appendAssistantTextDelta(ctx, ' world');
      const turn = useSessionStore.getState().conversationTurns[0];
      expect(turn!.content).toBe('Hello world');
    });
  });

  describe('completePendingAssistantTurn', () => {
    it('does nothing when no pending turn exists', () => {
      completePendingAssistantTurn(ctx);
      expect(useSessionStore.getState().conversationTurns).toHaveLength(0);
    });

    it('marks the pending turn as complete and clears pending id', () => {
      appendAssistantTurn(ctx, 'Response', 'streaming');
      completePendingAssistantTurn(ctx, 'Done');
      const turn = useSessionStore.getState().conversationTurns[0];
      expect(turn!.state).toBe('complete');
      expect(turn!.statusLabel).toBe('Done');
      expect(ctx.pendingAssistantTurnId).toBeNull();
    });
  });

  describe('failPendingAssistantTurn', () => {
    it('does nothing when no pending turn exists', () => {
      failPendingAssistantTurn(ctx, 'Error');
      expect(useSessionStore.getState().conversationTurns).toHaveLength(0);
    });

    it('marks the pending turn as error and clears pending id', () => {
      appendAssistantTurn(ctx, 'Partial', 'streaming');
      failPendingAssistantTurn(ctx, 'Response failed');
      const turn = useSessionStore.getState().conversationTurns[0];
      expect(turn!.state).toBe('error');
      expect(turn!.statusLabel).toBe('Response failed');
      expect(ctx.pendingAssistantTurnId).toBeNull();
    });
  });

  describe('clearPendingAssistantTurn', () => {
    it('sets pendingAssistantTurnId to null', () => {
      appendAssistantTurn(ctx, 'Response', 'streaming');
      expect(ctx.pendingAssistantTurnId).not.toBeNull();
      clearPendingAssistantTurn(ctx);
      expect(ctx.pendingAssistantTurnId).toBeNull();
    });
  });

  describe('getConversationTurn', () => {
    it('returns undefined for non-existent turn', () => {
      expect(getConversationTurn(ctx, 'nonexistent')).toBeUndefined();
    });

    it('returns the turn matching the given id', () => {
      appendUserTurn(ctx, 'Hello');
      const turn = getConversationTurn(ctx, 'user-turn-1');
      expect(turn).toEqual(
        expect.objectContaining({ id: 'user-turn-1', content: 'Hello' }),
      );
    });
  });

});
