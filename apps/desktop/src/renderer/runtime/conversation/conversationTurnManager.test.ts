import { beforeEach, describe, expect, it } from 'vitest';
import { useSessionStore } from '../../store/sessionStore';
import {
  appendAssistantTextDelta,
  appendAssistantTurn,
  appendUserTurn,
  buildTextChatRequest,
  clearPendingAssistantTurn,
  completePendingAssistantTurn,
  createConversationContext,
  failPendingAssistantTurn,
  getConversationTurn,
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

  describe('buildTextChatRequest', () => {
    it('builds a request with only the new user message when history is empty', () => {
      const request = buildTextChatRequest(ctx, 'Hello');
      expect(request).toEqual({
        messages: [{ role: 'user', content: 'Hello' }],
      });
    });

    it('includes completed conversation history', () => {
      appendUserTurn(ctx, 'First');
      appendAssistantTurn(ctx, 'Answer', 'complete');
      completePendingAssistantTurn(ctx);

      const request = buildTextChatRequest(ctx, 'Second');
      expect(request).toEqual({
        messages: [
          { role: 'user', content: 'First' },
          { role: 'assistant', content: 'Answer' },
          { role: 'user', content: 'Second' },
        ],
      });
    });

    it('excludes error turns from history', () => {
      appendUserTurn(ctx, 'First');
      appendAssistantTurn(ctx, 'Failed', 'error');
      clearPendingAssistantTurn(ctx);

      const request = buildTextChatRequest(ctx, 'Retry');
      expect(request).toEqual({
        messages: [
          { role: 'user', content: 'First' },
          { role: 'user', content: 'Retry' },
        ],
      });
    });

    it('excludes empty-content turns from history', () => {
      appendUserTurn(ctx, '  ');
      const request = buildTextChatRequest(ctx, 'Real message');
      expect(request).toEqual({
        messages: [{ role: 'user', content: 'Real message' }],
      });
    });
  });
});
