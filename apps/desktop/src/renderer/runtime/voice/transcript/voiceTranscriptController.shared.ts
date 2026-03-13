import type {
  CurrentVoiceTranscript,
  VoiceTranscriptEntry,
} from '../voice.types';

export type {
  CurrentVoiceTranscript,
  VoiceTranscriptEntry,
};

export type VoiceTranscriptRole = keyof CurrentVoiceTranscript;

export type SessionStoreApi = {
  getState: () => {
    currentVoiceTranscript: CurrentVoiceTranscript;
    setCurrentVoiceTranscriptEntry: (
      role: VoiceTranscriptRole,
      entry: Partial<VoiceTranscriptEntry>,
    ) => void;
    clearCurrentVoiceTranscript: () => void;
  };
};

export type VoiceTranscriptControllerOptions = {
  onConversationTurnSettled?: (turnId: string) => void;
};
