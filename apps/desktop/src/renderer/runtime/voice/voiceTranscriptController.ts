import { normalizeTranscriptText } from './voiceTranscript';
import type { ConversationContext } from '../conversation/conversationTurnManager';
import {
  appendUserTurn,
  clearCurrentVoiceTurns,
  finalizeCurrentVoiceAssistantTranscriptArtifact,
  finalizeCurrentVoiceUserTranscriptArtifact,
  getTranscriptArtifact,
  interruptCurrentVoiceAssistantTranscriptArtifact,
  upsertCurrentVoiceAssistantTranscriptArtifact,
  upsertCurrentVoiceUserTranscriptArtifact,
} from '../conversation/conversationTurnManager';

type SessionStoreApi = {
  getState: () => {
    currentVoiceTranscript: {
      user: { text: string; isFinal?: boolean | undefined };
      assistant: { text: string; isFinal?: boolean | undefined };
    };
    setCurrentVoiceTranscriptEntry: (
      role: 'user' | 'assistant',
      entry: { text: string; isFinal?: boolean | undefined },
    ) => void;
    clearCurrentVoiceTranscript: () => void;
  };
};

export type VoiceTranscriptController = {
  applyTranscriptUpdate: (
    role: 'user' | 'assistant',
    text: string,
    isFinal?: boolean,
  ) => void;
  ensureAssistantTurn: () => void;
  finalizeCurrentVoiceTurns: (
    finalizeReason: 'completed' | 'interrupted',
    options?: { assistantTurnId?: string | null },
  ) => void;
  attachCurrentAssistantTurn: (turnId: string | null) => void;
  queueMixedModeAssistantReply: () => void;
  clearQueuedMixedModeAssistantReply: () => void;
  resetTurnTranscriptState: () => void;
  clearTranscript: () => void;
  resetTurnCompletedFlag: () => void;
};

export function createVoiceTranscriptController(
  store: SessionStoreApi,
  conversationCtx: ConversationContext,
  options: {
    onConversationTurnSettled?: (turnId: string) => void;
  } = {},
): VoiceTranscriptController {
  let settledTurnReason: 'completed' | 'interrupted' | null = null;

  const clearTranscript = (): void => {
    store.getState().clearCurrentVoiceTranscript();
  };

  const shouldReuseCompletedUserTurn = (previousText: string, incomingText: string): boolean => {
    const previous = previousText.trim();
    const incoming = incomingText.trim();

    // Empty incoming updates (e.g. transcript reset signals) never start a new turn.
    if (incoming.length === 0) {
      return true;
    }

    // Only exact matches are corrections; any other text is a new utterance.
    return previous === incoming;
  };

  const currentAssistantArtifact = () => {
    if (!conversationCtx.currentVoiceAssistantArtifactId) {
      return null;
    }

    return getTranscriptArtifact(conversationCtx, conversationCtx.currentVoiceAssistantArtifactId) ?? null;
  };

  const currentUserArtifact = () => {
    if (!conversationCtx.currentVoiceUserArtifactId) {
      return null;
    }

    return getTranscriptArtifact(conversationCtx, conversationCtx.currentVoiceUserArtifactId) ?? null;
  };

  const consumeQueuedMixedModeAssistantReply = (): void => {
    if (!conversationCtx.hasQueuedMixedModeAssistantReply) {
      return;
    }

    const activeAssistantArtifact = currentAssistantArtifact();

    if (activeAssistantArtifact?.state === 'streaming') {
      return;
    }

    conversationCtx.hasQueuedMixedModeAssistantReply = false;
    conversationCtx.currentVoiceAssistantArtifactId = null;

    const activeUserArtifact = currentUserArtifact();
    if (!activeUserArtifact || activeUserArtifact.state !== 'streaming') {
      conversationCtx.currentVoiceUserArtifactId = null;
    }

    settledTurnReason = null;
    store.getState().setCurrentVoiceTranscriptEntry('assistant', {
      text: '',
      isFinal: undefined,
    });
  };

  const applyTranscriptUpdate = (
    role: 'user' | 'assistant',
    text: string,
    isFinal?: boolean,
  ): void => {
    if (role === 'assistant') {
      consumeQueuedMixedModeAssistantReply();
    }

    const state = store.getState();
    const previousEntry = state.currentVoiceTranscript[role];
    let preserveSettledState = settledTurnReason;

    if (role === 'user' && settledTurnReason) {
      if (!shouldReuseCompletedUserTurn(previousEntry.text, text)) {
        clearTranscript();
        clearCurrentVoiceTurns(conversationCtx);
        settledTurnReason = null;
        preserveSettledState = null;
      }
    }

    if (role === 'assistant' && text.length === 0) {
      ensureAssistantTurn();
    }

    const refreshedState = store.getState();
    const refreshedPreviousEntry = refreshedState.currentVoiceTranscript[role];
    const nextText = normalizeTranscriptText(refreshedPreviousEntry.text, text, {
      role,
      isFinal,
    });

    if (nextText === refreshedPreviousEntry.text && isFinal === refreshedPreviousEntry.isFinal) {
      return;
    }

    refreshedState.setCurrentVoiceTranscriptEntry(role, {
      text: nextText,
      ...(isFinal !== undefined ? { isFinal } : {}),
    });

    if (role === 'user') {
      upsertCurrentVoiceUserTranscriptArtifact(
        conversationCtx,
        nextText,
        isFinal,
        preserveSettledState ?? undefined,
      );
      return;
    }

    upsertCurrentVoiceAssistantTranscriptArtifact(
      conversationCtx,
      nextText,
      isFinal,
      preserveSettledState ?? undefined,
    );

    if (preserveSettledState === 'interrupted') {
      interruptCurrentVoiceAssistantTranscriptArtifact(conversationCtx);
    }
  };

  const ensureAssistantTurn = (): void => {
    consumeQueuedMixedModeAssistantReply();
    upsertCurrentVoiceAssistantTranscriptArtifact(
      conversationCtx,
      store.getState().currentVoiceTranscript.assistant.text,
      store.getState().currentVoiceTranscript.assistant.isFinal,
    );
  };

  const finalizeCurrentVoiceTurns = (
    finalizeReason: 'completed' | 'interrupted',
    finalizeOptions: { assistantTurnId?: string | null } = {},
  ): void => {
    if (settledTurnReason === finalizeReason) {
      return;
    }

    if (settledTurnReason === 'interrupted' && finalizeReason === 'completed') {
      return;
    }

    const currentTranscript = store.getState().currentVoiceTranscript;
    const userTranscriptText = currentTranscript.user.text.trim();
    const activeUserArtifact = currentUserArtifact();
    let finalizedUserTurnId: string | null = null;

    if (
      activeUserArtifact
      && activeUserArtifact.attachedTurnId === undefined
      && userTranscriptText.length > 0
    ) {
      finalizedUserTurnId = appendUserTurn(conversationCtx, userTranscriptText, {
        source: 'voice',
        ...(currentTranscript.user.isFinal !== undefined
          ? { transcriptFinal: currentTranscript.user.isFinal }
          : {}),
      });
    }

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
    settledTurnReason = finalizeReason;

    if (finalizedUserTurnId) {
      options.onConversationTurnSettled?.(finalizedUserTurnId);
    }
  };

  const queueMixedModeAssistantReply = (): void => {
    conversationCtx.hasQueuedMixedModeAssistantReply = true;
    consumeQueuedMixedModeAssistantReply();
  };

  const clearQueuedMixedModeAssistantReply = (): void => {
    conversationCtx.hasQueuedMixedModeAssistantReply = false;
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
      const finalizedUserTurnId = appendUserTurn(conversationCtx, currentTranscript.user.text.trim(), {
        source: 'voice',
        ...(currentTranscript.user.isFinal !== undefined
          ? { transcriptFinal: currentTranscript.user.isFinal }
          : {}),
      });
      finalizeCurrentVoiceUserTranscriptArtifact(conversationCtx, finalizedUserTurnId);
      options.onConversationTurnSettled?.(finalizedUserTurnId);
    }

    if (activeAssistantArtifact?.state === 'streaming') {
      if (activeAssistantArtifact.content.trim().length > 0) {
        interruptCurrentVoiceAssistantTranscriptArtifact(conversationCtx);
      }

      finalizeCurrentVoiceAssistantTranscriptArtifact(conversationCtx, {
        interrupted: activeAssistantArtifact.content.trim().length > 0,
      });
    }

    settledTurnReason = null;
    clearTranscript();
    clearCurrentVoiceTurns(conversationCtx);
  };

  const resetTurnCompletedFlag = (): void => {
    settledTurnReason = null;
  };

  const attachCurrentAssistantTurn = (turnId: string | null): void => {
    if (!turnId) {
      return;
    }

    finalizeCurrentVoiceAssistantTranscriptArtifact(conversationCtx, {
      attachedTurnId: turnId,
    });
  };

  return {
    applyTranscriptUpdate,
    ensureAssistantTurn,
    finalizeCurrentVoiceTurns,
    attachCurrentAssistantTurn,
    queueMixedModeAssistantReply,
    clearQueuedMixedModeAssistantReply,
    resetTurnTranscriptState,
    clearTranscript,
    resetTurnCompletedFlag,
  };
}
