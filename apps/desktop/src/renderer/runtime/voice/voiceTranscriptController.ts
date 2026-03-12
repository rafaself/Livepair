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
  let voiceTurnHasCompleted = false;

  const clearTranscript = (): void => {
    store.getState().clearCurrentVoiceTranscript();
  };

  const shouldReuseCompletedUserTurn = (previousText: string, incomingText: string): boolean => {
    const previous = previousText.trim();
    const incoming = incomingText.trim();

    if (previous.length === 0 || incoming.length === 0) {
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
    let preserveCompletedState = voiceTurnHasCompleted;

    if (role === 'user' && voiceTurnHasCompleted) {
      if (!shouldReuseCompletedUserTurn(previousEntry.text, text)) {
        clearTranscript();
        clearCurrentVoiceTurns(conversationCtx);
        voiceTurnHasCompleted = false;
        preserveCompletedState = false;
      }
    }

    if (role === 'assistant' && text.length === 0) {
      ensureAssistantTurn();
    }

    const refreshedState = store.getState();
    const refreshedPreviousEntry = refreshedState.currentVoiceTranscript[role];
    const nextText = normalizeTranscriptText(refreshedPreviousEntry.text, text);

    if (nextText === refreshedPreviousEntry.text && isFinal === refreshedPreviousEntry.isFinal) {
      return;
    }

    refreshedState.setCurrentVoiceTranscriptEntry(role, {
      text: nextText,
      ...(isFinal !== undefined ? { isFinal } : {}),
    });

    if (role === 'user') {
      upsertCurrentVoiceUserTurn(conversationCtx, nextText, isFinal);

      if (preserveCompletedState) {
        finalizeCurrentVoiceUserTurn(conversationCtx);
      }

      return;
    }

    upsertCurrentVoiceAssistantTurn(conversationCtx, nextText, isFinal);

    if (preserveCompletedState) {
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
    finalizeCurrentVoiceUserTurn(conversationCtx);

    if (finalizeReason === 'interrupted') {
      interruptCurrentVoiceAssistantTurn(conversationCtx);
    }

    finalizeCurrentVoiceAssistantTurn(conversationCtx);
    voiceTurnHasCompleted = true;
  };

  const resetTurnTranscriptState = (): void => {
    voiceTurnHasCompleted = false;
    clearTranscript();
    clearCurrentVoiceTurns(conversationCtx);
  };

  const resetTurnCompletedFlag = (): void => {
    voiceTurnHasCompleted = false;
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
