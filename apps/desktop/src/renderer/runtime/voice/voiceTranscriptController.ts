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
  resetTurnTranscriptState: () => void;
  clearTranscript: () => void;
  markTurnCompleted: () => void;
  resetTurnCompletedFlag: () => void;
};

export function createVoiceTranscriptController(
  store: SessionStoreApi,
): VoiceTranscriptController {
  let voiceTurnHasCompleted = false;

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
    }

    const previousEntry = state.currentVoiceTranscript[role];
    const nextText = normalizeTranscriptText(previousEntry.text, text);

    if (nextText === previousEntry.text && isFinal === previousEntry.isFinal) {
      return;
    }

    state.setCurrentVoiceTranscriptEntry(role, {
      text: nextText,
      ...(isFinal !== undefined ? { isFinal } : {}),
    });
  };

  const resetTurnTranscriptState = (): void => {
    voiceTurnHasCompleted = false;
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
    resetTurnTranscriptState,
    clearTranscript,
    markTurnCompleted,
    resetTurnCompletedFlag,
  };
}
