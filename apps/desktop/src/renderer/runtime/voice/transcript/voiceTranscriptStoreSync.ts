import {
  classifySettledUserTranscriptUpdate,
  normalizeTranscriptText,
} from './voiceTranscript';
import type { ConversationContext } from '../../conversation/conversationTurnManager';
import {
  beginVoiceTurnFence,
  clearCurrentVoiceTurns,
  hasOpenVoiceTurnFence,
  upsertCurrentVoiceAssistantTranscriptArtifact,
  upsertCurrentVoiceUserTranscriptArtifact,
  updateSettledVoiceUserTranscriptArtifact,
} from '../../conversation/conversationTurnManager';
import type {
  SessionStoreApi,
  VoiceTranscriptUpdateResult,
  VoiceTranscriptRole,
} from './voiceTranscriptController.shared';

type VoiceTranscriptStoreSyncArgs = {
  store: SessionStoreApi;
  conversationCtx: ConversationContext;
  clearTranscript: () => void;
  ensureAssistantTurn: () => boolean;
  queueMixedModeAssistantReply: () => void;
  hasSettledTurnFence: () => boolean;
  onConversationTurnUpdated?: (turnId: string) => void;
  emitDiagnostic?: (event: {
    scope: 'voice-session';
    name: string;
    data?: Record<string, unknown>;
  }) => void;
  logRuntimeDiagnostic?: (
    scope: 'voice-session',
    message: string,
    detail: Record<string, unknown>,
  ) => void;
}

export function createVoiceTranscriptStoreSync({
  store,
  conversationCtx,
  clearTranscript,
  ensureAssistantTurn,
  queueMixedModeAssistantReply,
  hasSettledTurnFence,
  onConversationTurnUpdated,
  emitDiagnostic,
  logRuntimeDiagnostic,
}: VoiceTranscriptStoreSyncArgs) {
  const reportDiagnostic = (
    name: string,
    data: Record<string, unknown>,
  ): void => {
    if (emitDiagnostic) {
      emitDiagnostic({
        scope: 'voice-session',
        name,
        data,
      });
      return;
    }

    logRuntimeDiagnostic?.('voice-session', name, data);
  };

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
  ): VoiceTranscriptUpdateResult => {
    const state = store.getState();
    const previousEntry = state.currentVoiceTranscript[role];

    if (role === 'user' && hasSettledTurnFence()) {
      const settledUpdateClassification = classifySettledUserTranscriptUpdate(
        previousEntry.text,
        text,
        { isFinal },
      );

      if (settledUpdateClassification === 'settled-correction') {
        const nextText = normalizeTranscriptText(previousEntry.text, text, {
          role,
          isFinal,
        });
        const didUpdate =
          nextText !== previousEntry.text || isFinal !== previousEntry.isFinal;

        if (!didUpdate) {
          return {
            role: 'user',
            classification: 'settled-correction',
            didUpdate: false,
          };
        }

        state.setCurrentVoiceTranscriptEntry('user', {
          text: nextText,
          ...(isFinal !== undefined ? { isFinal } : {}),
        });
        const updatedTurnId = updateSettledVoiceUserTranscriptArtifact(
          conversationCtx,
          nextText,
          isFinal,
        );
        queueMixedModeAssistantReply();
        if (updatedTurnId) {
          onConversationTurnUpdated?.(updatedTurnId);
        }

        return {
          role: 'user',
          classification: 'settled-correction',
          didUpdate: true,
        };
      }

      const previousTurnState = conversationCtx.currentVoiceTurnState;
      const replayedSettledTranscript = settledUpdateClassification === 'settled-replay';

      clearTranscript();
      clearCurrentVoiceTurns(conversationCtx);
      recordTurnReset(
        replayedSettledTranscript
          ? 'replayed-user-transcript'
          : 'new-user-transcript',
      );
      reportDiagnostic(
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
        return {
          role: 'user',
          classification: 'settled-replay',
          didUpdate: false,
        };
      }
    }

    if (role === 'assistant') {
      if (!ensureAssistantTurn()) {
        return {
          role: 'assistant',
          classification: 'assistant-update',
          didUpdate: false,
        };
      }

      if (text.length === 0) {
        return {
          role: 'assistant',
          classification: 'assistant-update',
          didUpdate: false,
        };
      }
    }

    let userClassification: VoiceTranscriptUpdateResult | null = null;

    if (role === 'user' && !hasOpenVoiceTurnFence(conversationCtx)) {
      beginVoiceTurnFence(conversationCtx);

      // Reserve a timeline ordinal for the user turn so that it appears
      // before any assistant artifact created later in this voice turn.
      const currentState = store.getState();
      const maxOrdinal = [...currentState.conversationTurns, ...currentState.transcriptArtifacts]
        .reduce((max, entry) => Math.max(max, entry.timelineOrdinal ?? 0), 0);
      conversationCtx.currentVoiceUserTimelineOrdinal = maxOrdinal + 1;
      userClassification = {
        role: 'user',
        classification: 'new-turn',
        didUpdate: false,
      };
    } else if (role === 'user') {
      userClassification = {
        role: 'user',
        classification: 'same-turn-update',
        didUpdate: false,
      };
    }

    const refreshedState = store.getState();
    const refreshedPreviousEntry = refreshedState.currentVoiceTranscript[role];
    const nextText = normalizeTranscriptText(refreshedPreviousEntry.text, text, {
      role,
      isFinal,
    });

    if (nextText === refreshedPreviousEntry.text && isFinal === refreshedPreviousEntry.isFinal) {
      if (role === 'assistant') {
        return {
          role: 'assistant',
          classification: 'assistant-update',
          didUpdate: false,
        };
      }

      return userClassification ?? {
        role: 'user',
        classification: 'same-turn-update',
        didUpdate: false,
      };
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

      return {
        ...(userClassification ?? {
          role: 'user',
          classification: 'same-turn-update',
          didUpdate: true,
        }),
        didUpdate: true,
      };
    }

    upsertCurrentVoiceAssistantTranscriptArtifact(
      conversationCtx,
      nextText,
      isFinal,
    );

    return {
      role: 'assistant',
      classification: 'assistant-update',
      didUpdate: true,
    };
  };

  return {
    applyTranscriptUpdate,
  };
}
