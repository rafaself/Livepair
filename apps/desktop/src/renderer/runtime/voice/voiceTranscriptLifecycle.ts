import type { ConversationContext } from '../conversation/conversationTurnManager';
import {
  appendUserTurn,
  clearCurrentVoiceTurns,
  finalizeCurrentVoiceAssistantTranscriptArtifact,
  finalizeCurrentVoiceUserTranscriptArtifact,
  getTranscriptArtifact,
  interruptCurrentVoiceAssistantTranscriptArtifact,
  settleVoiceTurnFence,
} from '../conversation/conversationTurnManager';
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

  if (
    !activeUserArtifact
    || activeUserArtifact.attachedTurnId !== undefined
    || userTranscriptText.length === 0
  ) {
    return null;
  }

  return appendUserTurn(conversationCtx, userTranscriptText, {
    source: 'voice',
    ...(activeUserArtifact.timelineOrdinal !== undefined
      ? { timelineOrdinal: activeUserArtifact.timelineOrdinal }
      : {}),
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

    if (
      activeUserArtifact?.state === 'streaming'
      && activeUserArtifact.attachedTurnId === undefined
      && currentTranscript.user.text.trim().length > 0
    ) {
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
      if (activeAssistantArtifact.content.trim().length > 0) {
        interruptCurrentVoiceAssistantTranscriptArtifact(conversationCtx);
      }

      finalizeCurrentVoiceAssistantTranscriptArtifact(conversationCtx, {
        interrupted: activeAssistantArtifact.content.trim().length > 0,
      });
    }

    clearTranscript();
    clearCurrentVoiceTurns(conversationCtx);
  };

  return {
    finalizeCurrentVoiceTurns,
    resetTurnTranscriptState,
  };
}
