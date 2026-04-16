import { formatConversationTimestamp } from './conversationTimestamp';
import { getTranscriptArtifact } from './conversationContext';
import { normalizeTranscriptText } from '../voice/transcript/voiceTranscript';
import type { ConversationContext } from './conversationContext';
import type { TranscriptArtifactModel } from './conversation.types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function appendTranscriptArtifact(
  ctx: ConversationContext,
  role: 'user' | 'assistant',
  content: string,
  state: TranscriptArtifactModel['state'],
  statusLabel?: string,
  transcriptFinal?: boolean,
  timelineOrdinal?: number,
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
    ...(timelineOrdinal !== undefined ? { timelineOrdinal } : {}),
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
  timelineOrdinal?: number,
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
            : 'Speaking...'
        : undefined,
      transcriptFinal,
      timelineOrdinal,
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
            : 'Speaking...'
        : undefined,
    ...(transcriptFinal !== undefined ? { transcriptFinal } : {}),
  });

  return currentArtifact.id;
}

// ---------------------------------------------------------------------------
// Voice transcript artifact lifecycle — public API
// ---------------------------------------------------------------------------

export function upsertCurrentVoiceUserTranscriptArtifact(
  ctx: ConversationContext,
  content: string,
  transcriptFinal?: boolean,
  settledReason?: 'completed' | 'interrupted',
): void {
  // Use the reserved timeline ordinal so the user artifact sorts before
  // any assistant artifact created later in the same voice turn.
  const ordinal = ctx.currentVoiceUserArtifactId
    ? undefined  // already created — ordinal was set at creation time
    : ctx.currentVoiceUserTimelineOrdinal ?? undefined;

  ctx.currentVoiceUserArtifactId = upsertTranscriptArtifact(
    ctx,
    'user',
    ctx.currentVoiceUserArtifactId,
    content,
    transcriptFinal,
    settledReason,
    ordinal,
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
    ctx.currentVoiceUserArtifactId = null;
    ctx.lastSettledUserArtifactId = artifact.id;
    return artifact.id;
  }

  updateTranscriptArtifact(ctx, artifact.id, {
    state: 'complete',
    statusLabel: undefined,
  });
  ctx.currentVoiceUserArtifactId = null;
  ctx.lastSettledUserArtifactId = artifact.id;
  return artifact.id;
}

export function updateSettledVoiceUserTranscriptArtifact(
  ctx: ConversationContext,
  content: string,
  transcriptFinal?: boolean,
): string | null {
  const artifactId = ctx.lastSettledUserArtifactId;

  if (!artifactId) {
    return null;
  }

  const artifact = getTranscriptArtifact(ctx, artifactId);

  if (!artifact) {
    ctx.lastSettledUserArtifactId = null;
    return null;
  }

  updateTranscriptArtifact(ctx, artifact.id, {
    content,
    state: 'complete',
    statusLabel: undefined,
    ...(transcriptFinal !== undefined ? { transcriptFinal } : {}),
  });

  if (artifact.attachedTurnId) {
    ctx.store.getState().updateConversationTurn(artifact.attachedTurnId, {
      content: content.trim(),
      ...(transcriptFinal !== undefined ? { transcriptFinal } : {}),
    });
  }

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
  ctx.lastSettledAssistantArtifactId = null;
  return artifact.id;
}
