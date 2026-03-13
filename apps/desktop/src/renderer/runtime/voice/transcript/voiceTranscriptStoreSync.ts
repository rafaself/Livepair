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
}: VoiceTranscriptStoreSyncArgs) {
  const applyTranscriptUpdate = (
    role: VoiceTranscriptRole,
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

  return {
    applyTranscriptUpdate,
  };
}
