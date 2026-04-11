import {
  appendUserTurn as appendConversationUserTurn,
  clearPendingAssistantTurn,
  createConversationContext,
} from '../conversation/conversationTurnManager';
import {
  persistConversationTurnInBackground,
} from '../conversation/persistConversationTurn';
import { createVoiceTranscriptController } from '../voice/transcript/voiceTranscriptController';
import type { SessionStoreApi } from '../core/sessionControllerTypes';
import type { createLiveRuntimeObservability } from './liveRuntimeObservability';

export function createSessionConversationSupport(
  store: SessionStoreApi,
  observability?: Pick<ReturnType<typeof createLiveRuntimeObservability>, 'emitDiagnostic'>,
) {
  const conversationCtx = createConversationContext(store);
  const persistSettledConversationTurn = (turnId: string): void => {
    persistConversationTurnInBackground(store, turnId);
  };
  const voiceTranscript = createVoiceTranscriptController(store, conversationCtx, {
    onConversationTurnSettled: persistSettledConversationTurn,
    ...(observability?.emitDiagnostic
      ? { emitDiagnostic: observability.emitDiagnostic }
      : {}),
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
