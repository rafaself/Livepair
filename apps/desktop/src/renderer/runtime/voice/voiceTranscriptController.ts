import { normalizeTranscriptText } from './voiceTranscript';

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
  consumePromotableAssistantTranscript: (
    finalizeReason: 'completed' | 'interrupted',
  ) => string | null;
  resetTurnTranscriptState: () => void;
  clearTranscript: () => void;
  markTurnCompleted: () => void;
  resetTurnCompletedFlag: () => void;
};

export function createVoiceTranscriptController(
  store: SessionStoreApi,
): VoiceTranscriptController {
  let voiceTurnHasCompleted = false;
  let assistantTranscriptPromoted = false;

  const clearTranscript = (): void => {
    store.getState().clearCurrentVoiceTranscript();
  };

  const applyTranscriptUpdate = (
    role: 'user' | 'assistant',
    text: string,
    isFinal?: boolean,
  ): void => {
    const state = store.getState();

    if (role === 'user' && voiceTurnHasCompleted) {
      clearTranscript();
      voiceTurnHasCompleted = false;
      assistantTranscriptPromoted = false;
    }

    const previousEntry = state.currentVoiceTranscript[role];
    const nextText = normalizeTranscriptText(previousEntry.text, text);

    if (nextText === previousEntry.text && isFinal === previousEntry.isFinal) {
      return;
    }

    if (role === 'assistant') {
      assistantTranscriptPromoted = false;
    }

    state.setCurrentVoiceTranscriptEntry(role, {
      text: nextText,
      ...(isFinal !== undefined ? { isFinal } : {}),
    });
  };

  const consumePromotableAssistantTranscript = (
    _finalizeReason: 'completed' | 'interrupted',
  ): string | null => {
    if (assistantTranscriptPromoted) {
      return null;
    }

    const content = store.getState().currentVoiceTranscript.assistant.text.trim();

    if (content.length === 0) {
      return null;
    }

    assistantTranscriptPromoted = true;
    return content;
  };

  const resetTurnTranscriptState = (): void => {
    voiceTurnHasCompleted = false;
    assistantTranscriptPromoted = false;
    clearTranscript();
  };

  const markTurnCompleted = (): void => {
    voiceTurnHasCompleted = true;
  };

  const resetTurnCompletedFlag = (): void => {
    voiceTurnHasCompleted = false;
  };

  return {
    applyTranscriptUpdate,
    consumePromotableAssistantTranscript,
    resetTurnTranscriptState,
    clearTranscript,
    markTurnCompleted,
    resetTurnCompletedFlag,
  };
}
