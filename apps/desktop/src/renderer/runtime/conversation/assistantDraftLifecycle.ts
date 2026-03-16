import { formatConversationTimestamp } from './conversationTimestamp';
import {
  getConversationTurn,
} from './conversationContext';
import type {
  AssistantDraftModel,
  ConversationContext,
} from './conversationContext';
import type {
  ConversationTurnModel,
} from './conversation.types';
import type { AnswerMetadata } from '@livepair/shared-types';

const ANSWER_PROVENANCE_PRIORITY: Record<AnswerMetadata['provenance'], number> = {
  unverified: 0,
  tool_grounded: 1,
  web_grounded: 2,
  project_grounded: 3,
};

const ANSWER_CONFIDENCE_PRIORITY: Record<NonNullable<AnswerMetadata['confidence']>, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

// ---------------------------------------------------------------------------
// Assistant draft lifecycle
// ---------------------------------------------------------------------------

function createAssistantDraft(ctx: ConversationContext): AssistantDraftModel {
  const draftId = `assistant-draft-${ctx.nextAssistantTurnId + 1}`;
  const draft: AssistantDraftModel = {
    id: draftId,
    role: 'assistant',
    content: '',
    ...(ctx.currentVoiceTurnId ? { liveTurnId: ctx.currentVoiceTurnId } : {}),
    ...(ctx.pendingAssistantAnswerMetadata ? { answerMetadata: ctx.pendingAssistantAnswerMetadata } : {}),
    status: 'streaming',
  };
  ctx.assistantDraft = draft;
  return draft;
}

export function clearAssistantDraft(ctx: ConversationContext): void {
  ctx.assistantDraft = null;
  ctx.pendingAssistantAnswerMetadata = null;
}

export function clearPendingAssistantTurn(ctx: ConversationContext): void {
  ctx.pendingAssistantTurnId = null;
  clearAssistantDraft(ctx);
}

export function appendAssistantDraftTextDelta(ctx: ConversationContext, text: string): AssistantDraftModel {
  const draft =
    ctx.assistantDraft === null || ctx.assistantDraft.status !== 'streaming'
      ? createAssistantDraft(ctx)
      : ctx.assistantDraft;

  draft.content = `${draft.content}${text}`;
  draft.status = 'streaming';
  return draft;
}

export function setAssistantAnswerMetadata(
  ctx: ConversationContext,
  answerMetadata: AnswerMetadata,
): void {
  const currentMetadata = ctx.assistantDraft?.answerMetadata ?? ctx.pendingAssistantAnswerMetadata;
  const nextMetadata = choosePreferredAnswerMetadata(currentMetadata, answerMetadata);
  ctx.pendingAssistantAnswerMetadata = nextMetadata;

  if (ctx.assistantDraft) {
    ctx.assistantDraft.answerMetadata = nextMetadata;
  }
}

function choosePreferredAnswerMetadata(
  current: AnswerMetadata | null | undefined,
  incoming: AnswerMetadata,
): AnswerMetadata {
  if (!current) {
    return incoming;
  }

  const currentPriority = ANSWER_PROVENANCE_PRIORITY[current.provenance];
  const incomingPriority = ANSWER_PROVENANCE_PRIORITY[incoming.provenance];

  if (incomingPriority > currentPriority) {
    return incoming;
  }

  if (incomingPriority < currentPriority) {
    return current;
  }

  return {
    provenance: current.provenance,
    citations: incoming.citations ?? current.citations,
    confidence: chooseHigherConfidence(current.confidence, incoming.confidence),
    reason: incoming.reason ?? current.reason,
  };
}

function chooseHigherConfidence(
  current: AnswerMetadata['confidence'],
  incoming: AnswerMetadata['confidence'],
): AnswerMetadata['confidence'] {
  if (!current) {
    return incoming;
  }

  if (!incoming) {
    return current;
  }

  return ANSWER_CONFIDENCE_PRIORITY[incoming] >= ANSWER_CONFIDENCE_PRIORITY[current]
    ? incoming
    : current;
}

export function completeAssistantDraft(ctx: ConversationContext): AssistantDraftModel | null {
  if (ctx.assistantDraft === null) {
    return null;
  }

  ctx.assistantDraft.status = 'complete';
  return ctx.assistantDraft;
}

export function interruptAssistantDraft(ctx: ConversationContext): AssistantDraftModel | null {
  if (ctx.assistantDraft === null) {
    return null;
  }

  ctx.assistantDraft.status = 'interrupted';
  return ctx.assistantDraft;
}

export function consumeCompletedAssistantDraft(ctx: ConversationContext): AssistantDraftModel | null {
  if (ctx.assistantDraft === null || ctx.assistantDraft.status !== 'complete') {
    return null;
  }

  const draft = ctx.assistantDraft;
  ctx.assistantDraft = null;
  return draft;
}

// ---------------------------------------------------------------------------
// Pending / completed / failed assistant turns
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
  options?: {
    source?: ConversationTurnModel['source'];
    transcriptFinal?: boolean;
    statusLabel?: string;
    timelineOrdinal?: number;
    answerMetadata?: AnswerMetadata;
  },
): string | null {
  const trimmedContent = content.trim();

  if (trimmedContent.length === 0) {
    return null;
  }

  const turnId = `assistant-turn-${++ctx.nextAssistantTurnId}`;
  ctx.store.getState().appendConversationTurn({
    id: turnId,
    role: 'assistant',
    content: trimmedContent,
    timestamp: formatConversationTimestamp(),
    state: 'complete',
    ...(options?.timelineOrdinal !== undefined ? { timelineOrdinal: options.timelineOrdinal } : {}),
    ...(ctx.currentVoiceTurnId ? { liveTurnId: ctx.currentVoiceTurnId } : {}),
    ...(options?.statusLabel ? { statusLabel: options.statusLabel } : {}),
    ...(options?.source ? { source: options.source } : {}),
    ...(options?.answerMetadata ? { answerMetadata: options.answerMetadata } : {}),
    ...(options?.transcriptFinal !== undefined
      ? { transcriptFinal: options.transcriptFinal }
      : {}),
  });
  return turnId;
}

export function completePendingAssistantTurn(
  ctx: ConversationContext,
  statusLabel?: string,
): string | null {
  if (!ctx.pendingAssistantTurnId) {
    return null;
  }

  const currentTurn = getConversationTurn(ctx, ctx.pendingAssistantTurnId);

  if (!currentTurn) {
    clearPendingAssistantTurn(ctx);
    return null;
  }

  updatePendingAssistantTurn(ctx, currentTurn.content, 'complete', statusLabel);
  const settledTurnId = currentTurn.id;
  clearPendingAssistantTurn(ctx);
  return settledTurnId;
}

export function failPendingAssistantTurn(
  ctx: ConversationContext,
  statusLabel: string,
): string | null {
  if (!ctx.pendingAssistantTurnId) {
    clearAssistantDraft(ctx);
    return null;
  }

  const currentTurn = getConversationTurn(ctx, ctx.pendingAssistantTurnId);

  if (!currentTurn) {
    clearPendingAssistantTurn(ctx);
    return null;
  }

  updatePendingAssistantTurn(ctx, currentTurn.content, 'error', statusLabel);
  const failedTurnId = currentTurn.id;
  clearPendingAssistantTurn(ctx);
  return failedTurnId;
}
