import type { ConversationContext } from '../../conversation/conversationTurnManager';
import {
  appendCompletedAssistantTurn,
  appendUserTurn,
  clearCurrentVoiceTurns,
  finalizeCurrentVoiceAssistantTranscriptArtifact,
  finalizeCurrentVoiceUserTranscriptArtifact,
  getTranscriptArtifact,
  interruptCurrentVoiceAssistantTranscriptArtifact,
  settleVoiceTurnFence,
} from '../../conversation/conversationTurnManager';
import type {
  CurrentVoiceTranscript,
  SessionStoreApi,
  VoiceTranscriptControllerOptions,
} from './voiceTranscriptController.shared';

type VoiceTranscriptLifecycleArgs = {
  store: SessionStoreApi;
  conversationCtx: ConversationContext;
  clearTranscript: () => void;
  currentAssistantArtifact: () => ReturnType<typeof getTranscriptArtifact> | null;
  currentUserArtifact: () => ReturnType<typeof getTranscriptArtifact> | null;
  onConversationTurnSettled?: VoiceTranscriptControllerOptions['onConversationTurnSettled'];
};

function appendFinalizedUserTurn(
  conversationCtx: ConversationContext,
  currentTranscript: CurrentVoiceTranscript,
  activeUserArtifact: ReturnType<typeof getTranscriptArtifact> | null,
): string | null {
  const userTranscriptText = currentTranscript.user.text.trim();

  if (userTranscriptText.length === 0) {
    return null;
  }

  if (activeUserArtifact?.attachedTurnId !== undefined) {
    return null;
  }

  // When no artifact exists, require a reserved ordinal to prove this is
  // un-consumed user speech. This prevents stale buffer text from being
  // re-materialized after a mixed-mode turn opens a new voice fence.
  if (!activeUserArtifact && conversationCtx.currentVoiceUserTimelineOrdinal === null) {
    return null;
  }

  const timelineOrdinal = activeUserArtifact?.timelineOrdinal
    ?? conversationCtx.currentVoiceUserTimelineOrdinal
    ?? undefined;

  // Consume the reserved ordinal so the same text cannot be materialized twice.
  conversationCtx.currentVoiceUserTimelineOrdinal = null;

  return appendUserTurn(conversationCtx, userTranscriptText, {
    source: 'voice',
    ...(timelineOrdinal !== undefined ? { timelineOrdinal } : {}),
    ...(currentTranscript.user.isFinal !== undefined
      ? { transcriptFinal: currentTranscript.user.isFinal }
      : {}),
  });
}

export function createVoiceTranscriptLifecycle({
  store,
  conversationCtx,
  clearTranscript,
  currentAssistantArtifact,
  currentUserArtifact,
  onConversationTurnSettled,
}: VoiceTranscriptLifecycleArgs) {
  const finalizeCurrentVoiceTurns = (
    finalizeReason: 'completed' | 'interrupted',
    finalizeOptions: { assistantTurnId?: string | null } = {},
  ): void => {
    if (!settleVoiceTurnFence(conversationCtx, finalizeReason)) {
      return;
    }

    const currentTranscript = store.getState().currentVoiceTranscript;
    const finalizedUserTurnId = appendFinalizedUserTurn(
      conversationCtx,
      currentTranscript,
      currentUserArtifact(),
    );

    finalizeCurrentVoiceUserTranscriptArtifact(conversationCtx, finalizedUserTurnId ?? undefined);

    if (finalizeReason === 'interrupted') {
      interruptCurrentVoiceAssistantTranscriptArtifact(conversationCtx);
    }

    finalizeCurrentVoiceAssistantTranscriptArtifact(conversationCtx, {
      interrupted: finalizeReason === 'interrupted',
      ...(finalizeReason === 'completed' && finalizeOptions.assistantTurnId
        ? { attachedTurnId: finalizeOptions.assistantTurnId }
        : {}),
    });

    if (finalizedUserTurnId) {
      onConversationTurnSettled?.(finalizedUserTurnId);
    }
  };

  const resetTurnTranscriptState = (): void => {
    const currentTranscript = store.getState().currentVoiceTranscript;
    const activeUserArtifact = currentUserArtifact();
    const activeAssistantArtifact = currentAssistantArtifact();

    const hasUnfinalizedUserText =
      currentTranscript.user.text.trim().length > 0
      && (
        !activeUserArtifact
        || (activeUserArtifact.state === 'streaming' && activeUserArtifact.attachedTurnId === undefined)
      );

    if (hasUnfinalizedUserText) {
      const finalizedUserTurnId = appendFinalizedUserTurn(
        conversationCtx,
        currentTranscript,
        activeUserArtifact,
      );

      if (finalizedUserTurnId) {
        finalizeCurrentVoiceUserTranscriptArtifact(conversationCtx, finalizedUserTurnId);
        onConversationTurnSettled?.(finalizedUserTurnId);
      }
    }

    if (activeAssistantArtifact?.state === 'streaming') {
      const hasContent = activeAssistantArtifact.content.trim().length > 0;

      if (hasContent) {
        interruptCurrentVoiceAssistantTranscriptArtifact(conversationCtx);
      }

      // Materialize the in-flight transcript as a persisted assistant turn so
      // it survives navigation to the chat history list and back.
      if (hasContent && activeAssistantArtifact.attachedTurnId === undefined) {
        const assistantTurnId = appendCompletedAssistantTurn(
          conversationCtx,
          activeAssistantArtifact.content,
          {
            source: 'voice',
            transcriptFinal: activeAssistantArtifact.transcriptFinal,
            ...(activeAssistantArtifact.timelineOrdinal !== undefined
              ? { timelineOrdinal: activeAssistantArtifact.timelineOrdinal }
              : {}),
          },
        );

        finalizeCurrentVoiceAssistantTranscriptArtifact(conversationCtx, {
          interrupted: true,
          ...(assistantTurnId ? { attachedTurnId: assistantTurnId } : {}),
        });

        if (assistantTurnId) {
          onConversationTurnSettled?.(assistantTurnId);
        }
      } else {
        finalizeCurrentVoiceAssistantTranscriptArtifact(conversationCtx, {
          interrupted: hasContent,
        });
      }
    }

    clearTranscript();
    clearCurrentVoiceTurns(conversationCtx);
  };

  return {
    finalizeCurrentVoiceTurns,
    resetTurnTranscriptState,
  };
}
