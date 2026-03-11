import { formatConversationTimestamp } from './conversationTimestamp';
import type { useSessionStore } from '../store/sessionStore';
import type { ConversationTurnModel } from './types';
import type { TextChatMessage, TextChatRequest } from '@livepair/shared-types';

type SessionStoreApi = Pick<typeof useSessionStore, 'getState'>;

/**
 * Mutable context bag that backs conversation turn management. All counter
 * and ID fields are mutated directly by the manager functions so changes are
 * shared with the caller through object-reference semantics.
 */
export interface ConversationContext {
  pendingAssistantTurnId: string | null;
  nextAssistantTurnId: number;
  nextUserTurnId: number;
  store: SessionStoreApi;
}

export function createConversationContext(store: SessionStoreApi): ConversationContext {
  return {
    pendingAssistantTurnId: null,
    nextAssistantTurnId: 0,
    nextUserTurnId: 0,
    store,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

export function getConversationTurn(
  ctx: ConversationContext,
  turnId: string,
): ConversationTurnModel | undefined {
  return ctx.store.getState().conversationTurns.find((turn) => turn.id === turnId);
}

export function clearPendingAssistantTurn(ctx: ConversationContext): void {
  ctx.pendingAssistantTurnId = null;
}

// ---------------------------------------------------------------------------
// Assistant turn lifecycle
// ---------------------------------------------------------------------------

export function updatePendingAssistantTurn(
  ctx: ConversationContext,
  content: string,
  state: ConversationTurnModel['state'],
  statusLabel?: string,
): void {
  if (!ctx.pendingAssistantTurnId) {
    return;
  }

  ctx.store.getState().updateConversationTurn(ctx.pendingAssistantTurnId, {
    content,
    state,
    statusLabel,
  });
}

export function appendAssistantTurn(
  ctx: ConversationContext,
  content: string,
  state: ConversationTurnModel['state'],
  statusLabel?: string,
): void {
  const turnId = `assistant-turn-${++ctx.nextAssistantTurnId}`;
  ctx.pendingAssistantTurnId = turnId;
  ctx.store.getState().appendConversationTurn({
    id: turnId,
    role: 'assistant',
    content,
    timestamp: formatConversationTimestamp(),
    state,
    statusLabel,
  });
}

export function appendAssistantTextDelta(ctx: ConversationContext, text: string): void {
  if (!ctx.pendingAssistantTurnId) {
    appendAssistantTurn(ctx, text, 'streaming', 'Responding...');
    return;
  }

  const currentTurn = getConversationTurn(ctx, ctx.pendingAssistantTurnId);

  if (!currentTurn) {
    appendAssistantTurn(ctx, text, 'streaming', 'Responding...');
    return;
  }

  updatePendingAssistantTurn(ctx, `${currentTurn.content}${text}`, 'streaming', 'Responding...');
}

export function completePendingAssistantTurn(ctx: ConversationContext, statusLabel?: string): void {
  if (!ctx.pendingAssistantTurnId) {
    return;
  }

  const currentTurn = getConversationTurn(ctx, ctx.pendingAssistantTurnId);

  if (!currentTurn) {
    clearPendingAssistantTurn(ctx);
    return;
  }

  updatePendingAssistantTurn(ctx, currentTurn.content, 'complete', statusLabel);
  clearPendingAssistantTurn(ctx);
}

export function failPendingAssistantTurn(ctx: ConversationContext, statusLabel: string): void {
  if (!ctx.pendingAssistantTurnId) {
    return;
  }

  const currentTurn = getConversationTurn(ctx, ctx.pendingAssistantTurnId);

  if (!currentTurn) {
    clearPendingAssistantTurn(ctx);
    return;
  }

  updatePendingAssistantTurn(ctx, currentTurn.content, 'error', statusLabel);
  clearPendingAssistantTurn(ctx);
}

// ---------------------------------------------------------------------------
// User turn + request building
// ---------------------------------------------------------------------------

export function appendUserTurn(ctx: ConversationContext, content: string): void {
  ctx.store.getState().appendConversationTurn({
    id: `user-turn-${++ctx.nextUserTurnId}`,
    role: 'user',
    content,
    timestamp: formatConversationTimestamp(),
    state: 'complete',
  });
}

export function buildTextChatRequest(ctx: ConversationContext, text: string): TextChatRequest {
  const messages: TextChatMessage[] = ctx.store
    .getState()
    .conversationTurns.filter(
      (turn) =>
        (turn.role === 'user' || turn.role === 'assistant') &&
        turn.content.trim().length > 0 &&
        turn.state !== 'error',
    )
    .map((turn) => ({
      role: turn.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: turn.content,
    }));

  messages.push({ role: 'user', content: text });

  return { messages };
}
