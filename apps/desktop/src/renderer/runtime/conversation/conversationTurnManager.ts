import { formatConversationTimestamp } from './conversationTimestamp';
import type { useSessionStore } from '../../store/sessionStore';
import type {
  ConversationTurnModel,
  TranscriptArtifactModel,
} from './conversation.types';
import { normalizeTranscriptText } from '../voice/voiceTranscript';

type SessionStoreApi = Pick<typeof useSessionStore, 'getState'>;

export type AssistantDraftModel = {
  id: string;
  role: 'assistant';
  content: string;
  liveTurnId?: string | undefined;
  status: 'streaming' | 'complete' | 'interrupted';
};

export type VoiceTurnFenceState = 'idle' | 'open' | 'completed' | 'interrupted';

/**
 * Mutable context bag that backs conversation turn management. All counter
 * and ID fields are mutated directly by the manager functions so changes are
 * shared with the caller through object-reference semantics.
 */
export interface ConversationContext {
  pendingAssistantTurnId: string | null;
  assistantDraft: AssistantDraftModel | null;
  hasQueuedMixedModeAssistantReply: boolean;
  currentVoiceTurnId: string | null;
  currentVoiceTurnState: VoiceTurnFenceState;
  lastSettledAssistantArtifactId: string | null;
  currentVoiceAssistantArtifactId: string | null;
  currentVoiceUserArtifactId: string | null;
  nextVoiceTurnId: number;
  nextAssistantTurnId: number;
  nextUserTurnId: number;
  nextTranscriptArtifactId: number;
  store: SessionStoreApi;
}

export function createConversationContext(store: SessionStoreApi): ConversationContext {
  return {
    pendingAssistantTurnId: null,
    assistantDraft: null,
    hasQueuedMixedModeAssistantReply: false,
    currentVoiceTurnId: null,
    currentVoiceTurnState: 'idle',
    lastSettledAssistantArtifactId: null,
    currentVoiceAssistantArtifactId: null,
    currentVoiceUserArtifactId: null,
    nextVoiceTurnId: 0,
    nextAssistantTurnId: 0,
    nextUserTurnId: 0,
    nextTranscriptArtifactId: 0,
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

export function getTranscriptArtifact(
  ctx: ConversationContext,
  artifactId: string,
): TranscriptArtifactModel | undefined {
  return ctx.store.getState().transcriptArtifacts.find((artifact) => artifact.id === artifactId);
}

export function clearPendingAssistantTurn(ctx: ConversationContext): void {
  ctx.pendingAssistantTurnId = null;
  clearAssistantDraft(ctx);
}

export function clearCurrentVoiceTurns(ctx: ConversationContext): void {
  ctx.hasQueuedMixedModeAssistantReply = false;
  ctx.currentVoiceTurnId = null;
  ctx.currentVoiceTurnState = 'idle';
  ctx.lastSettledAssistantArtifactId = null;
  ctx.currentVoiceAssistantArtifactId = null;
  ctx.currentVoiceUserArtifactId = null;
}

export function hasOpenVoiceTurnFence(ctx: ConversationContext): boolean {
  return ctx.currentVoiceTurnId !== null && ctx.currentVoiceTurnState === 'open';
}

export function beginVoiceTurnFence(ctx: ConversationContext): string {
  if (hasOpenVoiceTurnFence(ctx) && ctx.currentVoiceTurnId) {
    return ctx.currentVoiceTurnId;
  }

  ctx.currentVoiceTurnId = `voice-turn-${++ctx.nextVoiceTurnId}`;
  ctx.currentVoiceTurnState = 'open';
  ctx.lastSettledAssistantArtifactId = null;
  ctx.currentVoiceAssistantArtifactId = null;
  ctx.currentVoiceUserArtifactId = null;

  return ctx.currentVoiceTurnId;
}

export function settleVoiceTurnFence(
  ctx: ConversationContext,
  nextState: Extract<VoiceTurnFenceState, 'completed' | 'interrupted'>,
): boolean {
  if (!hasOpenVoiceTurnFence(ctx)) {
    return false;
  }

  ctx.currentVoiceTurnState = nextState;
  return true;
}

function appendTranscriptArtifact(
  ctx: ConversationContext,
  role: 'user' | 'assistant',
  content: string,
  state: TranscriptArtifactModel['state'],
  statusLabel?: string,
  transcriptFinal?: boolean,
): string {
  const artifactId = `${role}-transcript-${++ctx.nextTranscriptArtifactId}`;

  ctx.store.getState().appendTranscriptArtifact({
    kind: 'transcript',
    id: artifactId,
    role,
    content,
    timestamp: formatConversationTimestamp(),
    state,
    statusLabel,
    source: 'voice',
    ...(ctx.currentVoiceTurnId ? { liveTurnId: ctx.currentVoiceTurnId } : {}),
    ...(transcriptFinal !== undefined ? { transcriptFinal } : {}),
  });

  return artifactId;
}

function updateTranscriptArtifact(
  ctx: ConversationContext,
  artifactId: string | null,
  patch: Partial<
    Pick<
      TranscriptArtifactModel,
      'content' | 'state' | 'statusLabel' | 'transcriptFinal' | 'attachedTurnId'
    >
  >,
): TranscriptArtifactModel | null {
  if (!artifactId) {
    return null;
  }

  const currentArtifact = getTranscriptArtifact(ctx, artifactId);

  if (!currentArtifact) {
    return null;
  }

  ctx.store.getState().updateTranscriptArtifact(artifactId, patch);

  return {
    ...currentArtifact,
    ...patch,
  };
}

function upsertTranscriptArtifact(
  ctx: ConversationContext,
  role: 'user' | 'assistant',
  artifactId: string | null,
  content: string,
  transcriptFinal?: boolean,
  settledReason?: 'completed' | 'interrupted',
): string {
  const currentArtifact = artifactId ? getTranscriptArtifact(ctx, artifactId) : null;
  const shouldCreateSettledArtifact = settledReason !== undefined;

  if (!currentArtifact) {
    return appendTranscriptArtifact(
      ctx,
      role,
      content,
      shouldCreateSettledArtifact ? 'complete' : 'streaming',
      role === 'assistant'
        ? settledReason === 'interrupted'
          ? 'Interrupted'
          : shouldCreateSettledArtifact
            ? undefined
            : 'Responding...'
        : undefined,
      transcriptFinal,
    );
  }

  const nextContent = normalizeTranscriptText(currentArtifact.content, content, {
    role,
    isFinal: transcriptFinal,
  });

  updateTranscriptArtifact(ctx, currentArtifact.id, {
    content: nextContent,
    state: shouldCreateSettledArtifact ? 'complete' : 'streaming',
    statusLabel:
      role === 'assistant'
        ? settledReason === 'interrupted'
          ? 'Interrupted'
          : shouldCreateSettledArtifact
            ? undefined
            : 'Responding...'
        : undefined,
    ...(transcriptFinal !== undefined ? { transcriptFinal } : {}),
  });

  return currentArtifact.id;
}

// ---------------------------------------------------------------------------
// Assistant turn lifecycle
// ---------------------------------------------------------------------------

function createAssistantDraft(ctx: ConversationContext): AssistantDraftModel {
  const draftId = `assistant-draft-${ctx.nextAssistantTurnId + 1}`;
  const draft: AssistantDraftModel = {
    id: draftId,
    role: 'assistant',
    content: '',
    ...(ctx.currentVoiceTurnId ? { liveTurnId: ctx.currentVoiceTurnId } : {}),
    status: 'streaming',
  };
  ctx.assistantDraft = draft;
  return draft;
}

export function clearAssistantDraft(ctx: ConversationContext): void {
  ctx.assistantDraft = null;
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
    ...(options?.transcriptFinal !== undefined
      ? { transcriptFinal: options.transcriptFinal }
      : {}),
  });
  return turnId;
}

export function appendAssistantTextDelta(ctx: ConversationContext, text: string): void {
  appendAssistantDraftTextDelta(ctx, text);
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

// ---------------------------------------------------------------------------
// Voice transcript artifact lifecycle
// ---------------------------------------------------------------------------

export function upsertCurrentVoiceUserTranscriptArtifact(
  ctx: ConversationContext,
  content: string,
  transcriptFinal?: boolean,
  settledReason?: 'completed' | 'interrupted',
): void {
  ctx.currentVoiceUserArtifactId = upsertTranscriptArtifact(
    ctx,
    'user',
    ctx.currentVoiceUserArtifactId,
    content,
    transcriptFinal,
    settledReason,
  );
}

export function finalizeCurrentVoiceUserTranscriptArtifact(
  ctx: ConversationContext,
  attachedTurnId?: string,
): string | null {
  const currentArtifactId = ctx.currentVoiceUserArtifactId;
  const artifact = currentArtifactId ? getTranscriptArtifact(ctx, currentArtifactId) : null;

  if (!artifact) {
    ctx.currentVoiceUserArtifactId = null;
    return null;
  }

  if (attachedTurnId) {
    updateTranscriptArtifact(ctx, artifact.id, {
      state: 'complete',
      statusLabel: undefined,
      attachedTurnId,
    });
    ctx.store.getState().removeTranscriptArtifact(artifact.id);
    ctx.currentVoiceUserArtifactId = null;
    return artifact.id;
  }

  updateTranscriptArtifact(ctx, artifact.id, {
    state: 'complete',
    statusLabel: undefined,
  });
  ctx.currentVoiceUserArtifactId = null;
  return artifact.id;
}

export function upsertCurrentVoiceAssistantTranscriptArtifact(
  ctx: ConversationContext,
  content: string,
  transcriptFinal?: boolean,
  settledReason?: 'completed' | 'interrupted',
): void {
  ctx.currentVoiceAssistantArtifactId = upsertTranscriptArtifact(
    ctx,
    'assistant',
    ctx.currentVoiceAssistantArtifactId,
    content,
    transcriptFinal,
    settledReason,
  );
}

export function finalizeCurrentVoiceAssistantTranscriptArtifact(
  ctx: ConversationContext,
  options: {
    attachedTurnId?: string;
    interrupted?: boolean;
  } = {},
): string | null {
  const artifact = getTranscriptArtifact(ctx, ctx.currentVoiceAssistantArtifactId ?? '');

  if (!artifact) {
    ctx.currentVoiceAssistantArtifactId = null;
    return null;
  }

  if (artifact.content.trim().length === 0) {
    ctx.store.getState().removeTranscriptArtifact(artifact.id);
    ctx.currentVoiceAssistantArtifactId = null;
    return null;
  }

  if (options.attachedTurnId) {
    updateTranscriptArtifact(ctx, artifact.id, {
      state: 'complete',
      statusLabel: options.interrupted ? 'Interrupted' : undefined,
      attachedTurnId: options.attachedTurnId,
    });
    ctx.store.getState().removeTranscriptArtifact(artifact.id);
    ctx.currentVoiceAssistantArtifactId = null;
    ctx.lastSettledAssistantArtifactId = null;
    return artifact.id;
  }

  updateTranscriptArtifact(ctx, artifact.id, {
    state: 'complete',
    statusLabel: options.interrupted ? 'Interrupted' : undefined,
  });
  ctx.currentVoiceAssistantArtifactId = null;
  ctx.lastSettledAssistantArtifactId = artifact.id;
  return artifact.id;
}

export function interruptCurrentVoiceAssistantTranscriptArtifact(ctx: ConversationContext): void {
  updateTranscriptArtifact(ctx, ctx.currentVoiceAssistantArtifactId, {
    state: 'complete',
    statusLabel: 'Interrupted',
  });
}

export function attachSettledVoiceAssistantTranscriptArtifact(
  ctx: ConversationContext,
  turnId: string,
): string | null {
  const artifactId = ctx.lastSettledAssistantArtifactId;

  if (!artifactId) {
    return null;
  }

  const artifact = getTranscriptArtifact(ctx, artifactId);

  if (!artifact) {
    ctx.lastSettledAssistantArtifactId = null;
    return null;
  }

  updateTranscriptArtifact(ctx, artifact.id, {
    attachedTurnId: turnId,
  });
  ctx.store.getState().removeTranscriptArtifact(artifact.id);
  ctx.lastSettledAssistantArtifactId = null;
  return artifact.id;
}

// ---------------------------------------------------------------------------
// User turn + request building
// ---------------------------------------------------------------------------

export function appendUserTurn(
  ctx: ConversationContext,
  content: string,
  options?: {
    persistedMessageId?: string;
    source?: ConversationTurnModel['source'];
    transcriptFinal?: boolean;
    timelineOrdinal?: number;
  },
): string {
  const turnId = `user-turn-${++ctx.nextUserTurnId}`;

  ctx.store.getState().appendConversationTurn({
    id: turnId,
    role: 'user',
    content,
    timestamp: formatConversationTimestamp(),
    state: 'complete',
    ...(options?.timelineOrdinal !== undefined ? { timelineOrdinal: options.timelineOrdinal } : {}),
    ...(ctx.currentVoiceTurnId ? { liveTurnId: ctx.currentVoiceTurnId } : {}),
    ...(options?.persistedMessageId
      ? { persistedMessageId: options.persistedMessageId }
      : {}),
    ...(options?.source ? { source: options.source } : {}),
    ...(options?.transcriptFinal !== undefined
      ? { transcriptFinal: options.transcriptFinal }
      : {}),
  });

  return turnId;
}
