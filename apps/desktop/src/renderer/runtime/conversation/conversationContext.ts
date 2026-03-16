import type { AnswerMetadata } from '@livepair/shared-types';
import { formatConversationTimestamp } from './conversationTimestamp';
import type { useSessionStore } from '../../store/sessionStore';
import type {
  ConversationTurnModel,
  TranscriptArtifactModel,
} from './conversation.types';

type SessionStoreApi = Pick<typeof useSessionStore, 'getState'>;

export type AssistantDraftModel = {
  id: string;
  role: 'assistant';
  content: string;
  liveTurnId?: string | undefined;
  answerMetadata?: AnswerMetadata | undefined;
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
  pendingAssistantAnswerMetadata: AnswerMetadata | null;
  hasQueuedMixedModeAssistantReply: boolean;
  currentVoiceTurnId: string | null;
  currentVoiceTurnState: VoiceTurnFenceState;
  lastSettledAssistantArtifactId: string | null;
  currentVoiceAssistantArtifactId: string | null;
  currentVoiceUserArtifactId: string | null;
  currentVoiceUserTimelineOrdinal: number | null;
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
    pendingAssistantAnswerMetadata: null,
    hasQueuedMixedModeAssistantReply: false,
    currentVoiceTurnId: null,
    currentVoiceTurnState: 'idle',
    lastSettledAssistantArtifactId: null,
    currentVoiceAssistantArtifactId: null,
    currentVoiceUserArtifactId: null,
    currentVoiceUserTimelineOrdinal: null,
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

export function clearCurrentVoiceTurns(ctx: ConversationContext): void {
  ctx.hasQueuedMixedModeAssistantReply = false;
  ctx.currentVoiceTurnId = null;
  ctx.currentVoiceTurnState = 'idle';
  ctx.lastSettledAssistantArtifactId = null;
  ctx.currentVoiceAssistantArtifactId = null;
  ctx.currentVoiceUserArtifactId = null;
  ctx.currentVoiceUserTimelineOrdinal = null;
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

// ---------------------------------------------------------------------------
// User turn appending
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
