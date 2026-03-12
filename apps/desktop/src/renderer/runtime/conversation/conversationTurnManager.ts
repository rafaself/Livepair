import { formatConversationTimestamp } from './conversationTimestamp';
import type { useSessionStore } from '../../store/sessionStore';
import type { ConversationTurnModel } from './conversation.types';
import { normalizeTranscriptText } from '../voice/voiceTranscript';
import type { TextChatMessage, TextChatRequest } from '@livepair/shared-types';

type SessionStoreApi = Pick<typeof useSessionStore, 'getState'>;

/**
 * Mutable context bag that backs conversation turn management. All counter
 * and ID fields are mutated directly by the manager functions so changes are
 * shared with the caller through object-reference semantics.
 */
export interface ConversationContext {
  pendingAssistantTurnId: string | null;
  pendingVoiceAssistantReplyAnchorTurnId: string | null;
  currentVoiceAssistantTurnId: string | null;
  currentVoiceUserTurnId: string | null;
  nextAssistantTurnId: number;
  nextUserTurnId: number;
  store: SessionStoreApi;
}

export function createConversationContext(store: SessionStoreApi): ConversationContext {
  return {
    pendingAssistantTurnId: null,
    pendingVoiceAssistantReplyAnchorTurnId: null,
    currentVoiceAssistantTurnId: null,
    currentVoiceUserTurnId: null,
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

export function clearCurrentVoiceTurns(ctx: ConversationContext): void {
  ctx.pendingVoiceAssistantReplyAnchorTurnId = null;
  ctx.currentVoiceAssistantTurnId = null;
  ctx.currentVoiceUserTurnId = null;
}

function appendVoiceTurn(
  ctx: ConversationContext,
  role: 'user' | 'assistant',
  content: string,
  state: ConversationTurnModel['state'],
  statusLabel?: string,
  transcriptFinal?: boolean,
): string {
  const turnId =
    role === 'assistant'
      ? `assistant-turn-${++ctx.nextAssistantTurnId}`
      : `user-turn-${++ctx.nextUserTurnId}`;

  ctx.store.getState().appendConversationTurn({
    id: turnId,
    role,
    content,
    timestamp: formatConversationTimestamp(),
    state,
    statusLabel,
    source: 'voice',
    ...(transcriptFinal !== undefined ? { transcriptFinal } : {}),
  });

  return turnId;
}

function updateVoiceTurn(
  ctx: ConversationContext,
  turnId: string | null,
  patch: Partial<
    Pick<ConversationTurnModel, 'content' | 'state' | 'statusLabel' | 'transcriptFinal' | 'source'>
  >,
): ConversationTurnModel | null {
  if (!turnId) {
    return null;
  }

  const currentTurn = getConversationTurn(ctx, turnId);

  if (!currentTurn) {
    return null;
  }

  ctx.store.getState().updateConversationTurn(turnId, {
    ...patch,
    source: 'voice',
  });

  return {
    ...currentTurn,
    ...patch,
    source: 'voice',
  };
}

function upsertVoiceTurn(
  ctx: ConversationContext,
  role: 'user' | 'assistant',
  turnId: string | null,
  content: string,
  transcriptFinal?: boolean,
  settledReason?: 'completed' | 'interrupted',
): string {
  const currentTurn = turnId ? getConversationTurn(ctx, turnId) : null;
  const shouldCreateSettledTurn = settledReason !== undefined;

  if (!currentTurn) {
    return appendVoiceTurn(
      ctx,
      role,
      content,
      shouldCreateSettledTurn ? 'complete' : 'streaming',
      role === 'assistant'
        ? settledReason === 'interrupted'
          ? 'Interrupted'
          : shouldCreateSettledTurn
            ? undefined
            : 'Responding...'
        : undefined,
      transcriptFinal,
    );
  }

  const nextContent = normalizeTranscriptText(currentTurn.content, content, {
    role,
    isFinal: transcriptFinal,
  });

  updateVoiceTurn(ctx, currentTurn.id, {
    content: nextContent,
    state: shouldCreateSettledTurn ? 'complete' : 'streaming',
    statusLabel:
      role === 'assistant'
        ? settledReason === 'interrupted'
          ? 'Interrupted'
          : shouldCreateSettledTurn
            ? undefined
            : 'Responding...'
        : undefined,
    ...(transcriptFinal !== undefined ? { transcriptFinal } : {}),
  });

  return currentTurn.id;
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

export function appendCompletedAssistantTurn(
  ctx: ConversationContext,
  content: string,
  statusLabel?: string,
): void {
  const trimmedContent = content.trim();

  if (trimmedContent.length === 0) {
    return;
  }

  const turnId = `assistant-turn-${++ctx.nextAssistantTurnId}`;
  ctx.store.getState().appendConversationTurn({
    id: turnId,
    role: 'assistant',
    content: trimmedContent,
    timestamp: formatConversationTimestamp(),
    state: 'complete',
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
// Voice turn lifecycle
// ---------------------------------------------------------------------------

export function upsertCurrentVoiceUserTurn(
  ctx: ConversationContext,
  content: string,
  transcriptFinal?: boolean,
  settledReason?: 'completed' | 'interrupted',
): void {
  ctx.currentVoiceUserTurnId = upsertVoiceTurn(
    ctx,
    'user',
    ctx.currentVoiceUserTurnId,
    content,
    transcriptFinal,
    settledReason,
  );
}

export function finalizeCurrentVoiceUserTurn(ctx: ConversationContext): void {
  updateVoiceTurn(ctx, ctx.currentVoiceUserTurnId, {
    state: 'complete',
    statusLabel: undefined,
  });
}

export function upsertCurrentVoiceAssistantTurn(
  ctx: ConversationContext,
  content: string,
  transcriptFinal?: boolean,
  settledReason?: 'completed' | 'interrupted',
): void {
  ctx.currentVoiceAssistantTurnId = upsertVoiceTurn(
    ctx,
    'assistant',
    ctx.currentVoiceAssistantTurnId,
    content,
    transcriptFinal,
    settledReason,
  );
}

export function finalizeCurrentVoiceAssistantTurn(ctx: ConversationContext): void {
  const turn = getConversationTurn(ctx, ctx.currentVoiceAssistantTurnId ?? '');

  if (!turn) {
    ctx.currentVoiceAssistantTurnId = null;
    return;
  }

  if (turn.content.trim().length === 0) {
    ctx.store.getState().removeConversationTurn(turn.id);
    ctx.currentVoiceAssistantTurnId = null;
    return;
  }

  updateVoiceTurn(ctx, turn.id, {
    state: 'complete',
    statusLabel: turn.statusLabel === 'Interrupted' ? 'Interrupted' : undefined,
  });
}

export function interruptCurrentVoiceAssistantTurn(ctx: ConversationContext): void {
  updateVoiceTurn(ctx, ctx.currentVoiceAssistantTurnId, {
    state: 'complete',
    statusLabel: 'Interrupted',
  });
}

// ---------------------------------------------------------------------------
// User turn + request building
// ---------------------------------------------------------------------------

export function appendUserTurn(ctx: ConversationContext, content: string): string {
  const turnId = `user-turn-${++ctx.nextUserTurnId}`;

  ctx.store.getState().appendConversationTurn({
    id: turnId,
    role: 'user',
    content,
    timestamp: formatConversationTimestamp(),
    state: 'complete',
  });

  return turnId;
}

export function buildTextChatRequest(ctx: ConversationContext, text: string): TextChatRequest {
  const messages: TextChatMessage[] = ctx.store
    .getState()
    .conversationTurns.filter(
      (turn) =>
        (turn.role === 'user' || turn.role === 'assistant') &&
        turn.content.trim().length > 0 &&
        turn.state !== 'error' &&
        turn.state !== 'streaming',
    )
    .map((turn) => ({
      role: turn.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: turn.content,
    }));

  messages.push({ role: 'user', content: text });

  return { messages };
}
