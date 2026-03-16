import {
  appendUserTurn as appendConversationUserTurn,
  clearPendingAssistantTurn,
  createConversationContext,
} from '../conversation/conversationTurnManager';
import {
  persistConversationTurnInBackground,
} from '../conversation/persistConversationTurn';
import { logRuntimeDiagnostic } from '../core/logger';
import { createVoiceTranscriptController } from '../voice/transcript/voiceTranscriptController';
import type { SessionStoreApi } from '../core/sessionControllerTypes';

export function createSessionConversationSupport(store: SessionStoreApi) {
  const conversationCtx = createConversationContext(store);
  const persistSettledConversationTurn = (turnId: string): void => {
    persistConversationTurnInBackground(store, turnId);
  };
  const voiceTranscript = createVoiceTranscriptController(store, conversationCtx, {
    onConversationTurnSettled: persistSettledConversationTurn,
    logRuntimeDiagnostic,
  });

  return {
    appendTypedUserTurn: (text: string): string => {
      const turnId = appendConversationUserTurn(conversationCtx, text, { source: 'text' });
      persistSettledConversationTurn(turnId);
      return turnId;
    },
    clearPendingAssistantTurn: (): void => {
      clearPendingAssistantTurn(conversationCtx);
    },
    conversationCtx,
    persistSettledConversationTurn,
    voiceTranscript,
  };
}
