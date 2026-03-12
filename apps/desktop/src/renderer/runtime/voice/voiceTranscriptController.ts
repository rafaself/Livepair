import { normalizeTranscriptText } from './voiceTranscript';
import type { ConversationContext } from '../conversation/conversationTurnManager';
import {
  clearCurrentVoiceTurns,
  finalizeCurrentVoiceAssistantTurn,
  finalizeCurrentVoiceUserTurn,
  interruptCurrentVoiceAssistantTurn,
  upsertCurrentVoiceAssistantTurn,
  upsertCurrentVoiceUserTurn,
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
  ) => void;
  resetTurnTranscriptState: () => void;
  clearTranscript: () => void;
  resetTurnCompletedFlag: () => void;
};

export function createVoiceTranscriptController(
  store: SessionStoreApi,
  conversationCtx: ConversationContext,
): VoiceTranscriptController {
  let settledTurnReason: 'completed' | 'interrupted' | null = null;

  const clearTranscript = (): void => {
    store.getState().clearCurrentVoiceTranscript();
  };

  const shouldReuseCompletedUserTurn = (previousText: string, incomingText: string): boolean => {
    const previous = previousText.trim();
    const incoming = incomingText.trim();

    if (previous.length === 0) {
      return incoming.length === 0;
    }

    if (incoming.length === 0) {
      return true;
    }

    return (
      previous === incoming ||
      previous.startsWith(incoming) ||
      incoming.startsWith(previous) ||
      previous.includes(incoming) ||
      incoming.includes(previous)
    );
  };

  const applyTranscriptUpdate = (
    role: 'user' | 'assistant',
    text: string,
    isFinal?: boolean,
  ): void => {
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
      upsertCurrentVoiceUserTurn(conversationCtx, nextText, isFinal, preserveSettledState ?? undefined);

      if (preserveSettledState !== null) {
        finalizeCurrentVoiceUserTurn(conversationCtx);
      }

      return;
    }

    upsertCurrentVoiceAssistantTurn(
      conversationCtx,
      nextText,
      isFinal,
      preserveSettledState ?? undefined,
    );

    if (preserveSettledState === 'interrupted') {
      interruptCurrentVoiceAssistantTurn(conversationCtx);
      return;
    }

    if (preserveSettledState === 'completed') {
      finalizeCurrentVoiceAssistantTurn(conversationCtx);
    }
  };

  const ensureAssistantTurn = (): void => {
    upsertCurrentVoiceAssistantTurn(
      conversationCtx,
      store.getState().currentVoiceTranscript.assistant.text,
      store.getState().currentVoiceTranscript.assistant.isFinal,
    );
  };

  const finalizeCurrentVoiceTurns = (
    finalizeReason: 'completed' | 'interrupted',
  ): void => {
    if (settledTurnReason === 'interrupted' && finalizeReason === 'completed') {
      return;
    }

    finalizeCurrentVoiceUserTurn(conversationCtx);

    if (finalizeReason === 'interrupted') {
      interruptCurrentVoiceAssistantTurn(conversationCtx);
    }

    finalizeCurrentVoiceAssistantTurn(conversationCtx);
    settledTurnReason = finalizeReason;
  };

  const resetTurnTranscriptState = (): void => {
    settledTurnReason = null;
    clearTranscript();
    clearCurrentVoiceTurns(conversationCtx);
  };

  const resetTurnCompletedFlag = (): void => {
    settledTurnReason = null;
  };

  return {
    applyTranscriptUpdate,
    ensureAssistantTurn,
    finalizeCurrentVoiceTurns,
    resetTurnTranscriptState,
    clearTranscript,
    resetTurnCompletedFlag,
  };
}
