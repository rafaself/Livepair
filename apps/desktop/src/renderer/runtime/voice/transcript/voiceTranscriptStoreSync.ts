import { normalizeTranscriptText } from './voiceTranscript';
import type { ConversationContext } from '../../conversation/conversationTurnManager';
import {
  beginVoiceTurnFence,
  clearCurrentVoiceTurns,
  hasOpenVoiceTurnFence,
  upsertCurrentVoiceAssistantTranscriptArtifact,
  upsertCurrentVoiceUserTranscriptArtifact,
} from '../../conversation/conversationTurnManager';
import type {
  SessionStoreApi,
  VoiceTranscriptRole,
} from './voiceTranscriptController.shared';

type VoiceTranscriptStoreSyncArgs = {
  store: SessionStoreApi;
  conversationCtx: ConversationContext;
  clearTranscript: () => void;
  ensureAssistantTurn: () => boolean;
  hasSettledTurnFence: () => boolean;
  logRuntimeDiagnostic?: (
    scope: 'voice-session',
    message: string,
    detail: Record<string, unknown>,
  ) => void;
};

function shouldReuseCompletedUserTurn(previousText: string, incomingText: string): boolean {
  const previous = previousText.trim();
  const incoming = incomingText.trim();

  if (incoming.length === 0) {
    return true;
  }

  return previous === incoming;
}

export function createVoiceTranscriptStoreSync({
  store,
  conversationCtx,
  clearTranscript,
  ensureAssistantTurn,
  hasSettledTurnFence,
  logRuntimeDiagnostic,
}: VoiceTranscriptStoreSyncArgs) {
  const recordTurnReset = (reason: 'replayed-user-transcript' | 'new-user-transcript'): void => {
    store.getState().setVoiceSessionRecoveryDiagnostics({
      lastTurnResetReason: reason,
      lastTurnResetAt: new Date().toISOString(),
    });
  };

  const applyTranscriptUpdate = (
    role: VoiceTranscriptRole,
    text: string,
    isFinal?: boolean,
  ): void => {
    const state = store.getState();
    const previousEntry = state.currentVoiceTranscript[role];

    if (role === 'user' && hasSettledTurnFence()) {
      const replayedSettledTranscript = shouldReuseCompletedUserTurn(previousEntry.text, text);
      const previousTurnState = conversationCtx.currentVoiceTurnState;

      clearTranscript();
      clearCurrentVoiceTurns(conversationCtx);
      recordTurnReset(
        replayedSettledTranscript
          ? 'replayed-user-transcript'
          : 'new-user-transcript',
      );
      logRuntimeDiagnostic?.(
        'voice-session',
        replayedSettledTranscript
          ? 'reopened settled voice turn after user transcript replay'
          : 'reopened settled voice turn for new user transcript',
        {
          previousTurnState,
          replayedSettledTranscript,
          previousUserTextLength: previousEntry.text.trim().length,
          incomingUserTextLength: text.trim().length,
        },
      );

      if (replayedSettledTranscript) {
        return;
      }
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

      // Reserve a timeline ordinal for the user turn so that it appears
      // before any assistant artifact created later in this voice turn.
      const currentState = store.getState();
      const maxOrdinal = [...currentState.conversationTurns, ...currentState.transcriptArtifacts]
        .reduce((max, entry) => Math.max(max, entry.timelineOrdinal ?? 0), 0);
      conversationCtx.currentVoiceUserTimelineOrdinal = maxOrdinal + 1;
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

  return {
    applyTranscriptUpdate,
  };
}
