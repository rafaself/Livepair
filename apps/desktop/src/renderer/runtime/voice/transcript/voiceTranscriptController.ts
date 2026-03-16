import type { ConversationContext } from '../../conversation/conversationTurnManager';
import { createVoiceTranscriptLifecycle } from './voiceTranscriptLifecycle';
import { createVoiceTranscriptStoreSync } from './voiceTranscriptStoreSync';
import { createVoiceTranscriptTurnState } from './voiceTranscriptTurnState';
import type {
  SessionStoreApi,
  VoiceTranscriptControllerOptions,
} from './voiceTranscriptController.shared';

export type VoiceTranscriptController = {
  applyTranscriptUpdate: (
    role: 'user' | 'assistant',
    text: string,
    isFinal?: boolean,
  ) => void;
  ensureAssistantTurn: () => boolean;
  finalizeCurrentVoiceTurns: (finalizeReason: 'completed' | 'interrupted') => void;
  attachCurrentAssistantTurn: (turnId: string | null) => void;
  queueMixedModeAssistantReply: () => void;
  clearQueuedMixedModeAssistantReply: () => void;
  resetTurnTranscriptState: () => void;
  clearTranscript: () => void;
  resetTurnCompletedFlag: () => void;
};

export function createVoiceTranscriptController(
  store: SessionStoreApi,
  conversationCtx: ConversationContext,
  options: VoiceTranscriptControllerOptions = {},
): VoiceTranscriptController {
  const clearTranscript = (): void => {
    store.getState().clearCurrentVoiceTranscript();
  };
  const turnState = createVoiceTranscriptTurnState({
    store,
    conversationCtx,
  });
  const storeSync = createVoiceTranscriptStoreSync({
    store,
    conversationCtx,
    clearTranscript,
    ensureAssistantTurn: turnState.ensureAssistantTurn,
    hasSettledTurnFence: turnState.hasSettledTurnFence,
    ...(options.logRuntimeDiagnostic
      ? {
          logRuntimeDiagnostic: options.logRuntimeDiagnostic,
        }
      : {}),
  });
  const lifecycle = createVoiceTranscriptLifecycle({
    store,
    conversationCtx,
    clearTranscript,
    currentAssistantArtifact: turnState.currentAssistantArtifact,
    currentUserArtifact: turnState.currentUserArtifact,
    onConversationTurnSettled: options.onConversationTurnSettled,
  });

  return {
    applyTranscriptUpdate: storeSync.applyTranscriptUpdate,
    ensureAssistantTurn: turnState.ensureAssistantTurn,
    finalizeCurrentVoiceTurns: lifecycle.finalizeCurrentVoiceTurns,
    attachCurrentAssistantTurn: turnState.attachCurrentAssistantTurn,
    queueMixedModeAssistantReply: turnState.queueMixedModeAssistantReply,
    clearQueuedMixedModeAssistantReply: turnState.clearQueuedMixedModeAssistantReply,
    resetTurnTranscriptState: lifecycle.resetTurnTranscriptState,
    clearTranscript,
    resetTurnCompletedFlag: turnState.resetTurnCompletedFlag,
  };
}
