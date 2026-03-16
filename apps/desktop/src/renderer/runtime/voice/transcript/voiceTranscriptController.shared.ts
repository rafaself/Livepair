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
    setVoiceSessionRecoveryDiagnostics: (patch: {
      lastTurnResetReason?: 'replayed-user-transcript' | 'new-user-transcript' | null;
      lastTurnResetAt?: string | null;
    }) => void;
    clearCurrentVoiceTranscript: () => void;
    conversationTurns: ReadonlyArray<{ timelineOrdinal?: number | undefined }>;
    transcriptArtifacts: ReadonlyArray<{ timelineOrdinal?: number | undefined }>;
  };
};

export type VoiceTranscriptControllerOptions = {
  onConversationTurnSettled?: (turnId: string) => void;
  logRuntimeDiagnostic?: (
    scope: 'voice-session',
    message: string,
    detail: Record<string, unknown>,
  ) => void;
};
