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
            : 'Speaking...'
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
