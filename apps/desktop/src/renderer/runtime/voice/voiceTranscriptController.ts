import { normalizeTranscriptText } from './voiceTranscript';
import type { ConversationContext } from '../conversation/conversationTurnManager';
import {
  appendUserTurn,
  attachSettledVoiceAssistantTranscriptArtifact,
  beginVoiceTurnFence,
  clearCurrentVoiceTurns,
  finalizeCurrentVoiceAssistantTranscriptArtifact,
  finalizeCurrentVoiceUserTranscriptArtifact,
  getTranscriptArtifact,
  hasOpenVoiceTurnFence,
  interruptCurrentVoiceAssistantTranscriptArtifact,
  settleVoiceTurnFence,
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
  ensureAssistantTurn: () => boolean;
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
  const clearTranscript = (): void => {
    store.getState().clearCurrentVoiceTranscript();
  };

  const currentTurnFenceState = () => conversationCtx.currentVoiceTurnState;

  const hasSettledTurnFence = (): boolean =>
    currentTurnFenceState() === 'completed' || currentTurnFenceState() === 'interrupted';

  const shouldReuseCompletedUserTurn = (previousText: string, incomingText: string): boolean => {
    const previous = previousText.trim();
    const incoming = incomingText.trim();

    if (incoming.length === 0) {
      return true;
    }

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

  const prepareQueuedMixedModeAssistantReply = (): void => {
    if (!conversationCtx.hasQueuedMixedModeAssistantReply) {
      return;
    }

    const activeAssistantArtifact = currentAssistantArtifact();

    if (activeAssistantArtifact?.state === 'streaming') {
      return;
    }

    if (!hasOpenVoiceTurnFence(conversationCtx)) {
      beginVoiceTurnFence(conversationCtx);
    }

    conversationCtx.hasQueuedMixedModeAssistantReply = false;
    conversationCtx.currentVoiceAssistantArtifactId = null;
    conversationCtx.lastSettledAssistantArtifactId = null;

    const activeUserArtifact = currentUserArtifact();
    if (!activeUserArtifact || activeUserArtifact.state !== 'streaming') {
      conversationCtx.currentVoiceUserArtifactId = null;
    }

    store.getState().setCurrentVoiceTranscriptEntry('assistant', {
      text: '',
      isFinal: undefined,
    });
  };

  const ensureAssistantTurn = (): boolean => {
    if (hasSettledTurnFence() && !conversationCtx.hasQueuedMixedModeAssistantReply) {
      return false;
    }

    prepareQueuedMixedModeAssistantReply();

    if (!hasOpenVoiceTurnFence(conversationCtx)) {
      beginVoiceTurnFence(conversationCtx);
    }

    upsertCurrentVoiceAssistantTranscriptArtifact(
      conversationCtx,
      store.getState().currentVoiceTranscript.assistant.text,
      store.getState().currentVoiceTranscript.assistant.isFinal,
    );

    return true;
  };

  const applyTranscriptUpdate = (
    role: 'user' | 'assistant',
    text: string,
    isFinal?: boolean,
  ): void => {
    const state = store.getState();
    const previousEntry = state.currentVoiceTranscript[role];

    if (role === 'user' && hasSettledTurnFence()) {
      if (shouldReuseCompletedUserTurn(previousEntry.text, text)) {
        return;
      }

      clearTranscript();
      clearCurrentVoiceTurns(conversationCtx);
    }

    if (role === 'assistant') {
      if (!ensureAssistantTurn()) {
        return;
      }

      if (text.length === 0) {
        return;
      }
    } else if (!hasOpenVoiceTurnFence(conversationCtx)) {
      beginVoiceTurnFence(conversationCtx);
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
      );
      return;
    }

    upsertCurrentVoiceAssistantTranscriptArtifact(
      conversationCtx,
      nextText,
      isFinal,
    );
  };

  const finalizeCurrentVoiceTurns = (
    finalizeReason: 'completed' | 'interrupted',
    finalizeOptions: { assistantTurnId?: string | null } = {},
  ): void => {
    if (!settleVoiceTurnFence(conversationCtx, finalizeReason)) {
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
        ...(activeUserArtifact.timelineOrdinal !== undefined
          ? { timelineOrdinal: activeUserArtifact.timelineOrdinal }
          : {}),
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

    if (finalizedUserTurnId) {
      options.onConversationTurnSettled?.(finalizedUserTurnId);
    }
  };

  const queueMixedModeAssistantReply = (): void => {
    conversationCtx.hasQueuedMixedModeAssistantReply = true;
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
        ...(activeUserArtifact.timelineOrdinal !== undefined
          ? { timelineOrdinal: activeUserArtifact.timelineOrdinal }
          : {}),
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

    clearTranscript();
    clearCurrentVoiceTurns(conversationCtx);
  };

  const resetTurnCompletedFlag = (): void => {
    if (!hasOpenVoiceTurnFence(conversationCtx)) {
      conversationCtx.currentVoiceTurnId = null;
      conversationCtx.currentVoiceTurnState = 'idle';
      conversationCtx.lastSettledAssistantArtifactId = null;
    }
  };

  const attachCurrentAssistantTurn = (turnId: string | null): void => {
    if (!turnId) {
      return;
    }

    attachSettledVoiceAssistantTranscriptArtifact(conversationCtx, turnId);
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
