export type VoiceTranscriptRole = 'user' | 'assistant';

export type VoiceTranscriptEntry = {
  text: string;
  isFinal?: boolean | undefined;
};

export type CurrentVoiceTranscriptState = {
  user: VoiceTranscriptEntry;
  assistant: VoiceTranscriptEntry;
};

export type SessionStoreApi = {
  getState: () => {
    currentVoiceTranscript: CurrentVoiceTranscriptState;
    setCurrentVoiceTranscriptEntry: (
      role: VoiceTranscriptRole,
      entry: VoiceTranscriptEntry,
    ) => void;
    clearCurrentVoiceTranscript: () => void;
  };
};

export type VoiceTranscriptControllerOptions = {
  onConversationTurnSettled?: (turnId: string) => void;
};
