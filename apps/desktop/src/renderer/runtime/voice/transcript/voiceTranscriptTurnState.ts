import type { ConversationContext } from '../../conversation/conversationTurnManager';
import {
  attachSettledVoiceAssistantTranscriptArtifact,
  beginVoiceTurnFence,
  getTranscriptArtifact,
  hasOpenVoiceTurnFence,
  upsertCurrentVoiceAssistantTranscriptArtifact,
} from '../../conversation/conversationTurnManager';
import type { SessionStoreApi } from './voiceTranscriptController.shared';

type VoiceTranscriptTurnStateArgs = {
  store: SessionStoreApi;
  conversationCtx: ConversationContext;
};

export function createVoiceTranscriptTurnState({
  store,
  conversationCtx,
}: VoiceTranscriptTurnStateArgs) {
  const currentAssistantArtifact = () => {
    if (!conversationCtx.currentVoiceAssistantArtifactId) {
      return null;
    }

    return getTranscriptArtifact(conversationCtx, conversationCtx.currentVoiceAssistantArtifactId) ?? null;
  };

  const currentUserArtifact = () => {
    if (!conversationCtx.currentVoiceUserArtifactId) {
      return null;
    }

    return getTranscriptArtifact(conversationCtx, conversationCtx.currentVoiceUserArtifactId) ?? null;
  };

  const hasSettledTurnFence = (): boolean =>
    conversationCtx.currentVoiceTurnState === 'completed'
    || conversationCtx.currentVoiceTurnState === 'interrupted';

  const prepareQueuedMixedModeAssistantReply = (): void => {
    if (!conversationCtx.hasQueuedMixedModeAssistantReply) {
      return;
    }

    const activeAssistantArtifact = currentAssistantArtifact();

    if (activeAssistantArtifact?.state === 'streaming') {
      return;
    }

    if (!hasOpenVoiceTurnFence(conversationCtx)) {
      beginVoiceTurnFence(conversationCtx);
    }

    conversationCtx.hasQueuedMixedModeAssistantReply = false;
    conversationCtx.currentVoiceAssistantArtifactId = null;
    conversationCtx.lastSettledAssistantArtifactId = null;

    const activeUserArtifact = currentUserArtifact();
    if (!activeUserArtifact || activeUserArtifact.state !== 'streaming') {
      conversationCtx.currentVoiceUserArtifactId = null;
    }

    store.getState().setCurrentVoiceTranscriptEntry('assistant', {
      text: '',
      isFinal: undefined,
    });
  };

  const ensureAssistantTurn = (): boolean => {
    if (hasSettledTurnFence() && !conversationCtx.hasQueuedMixedModeAssistantReply) {
      return false;
    }

    prepareQueuedMixedModeAssistantReply();

    if (!hasOpenVoiceTurnFence(conversationCtx)) {
      beginVoiceTurnFence(conversationCtx);
    }

    upsertCurrentVoiceAssistantTranscriptArtifact(
      conversationCtx,
      store.getState().currentVoiceTranscript.assistant.text,
      store.getState().currentVoiceTranscript.assistant.isFinal,
    );

    return true;
  };

  const queueMixedModeAssistantReply = (): void => {
    conversationCtx.hasQueuedMixedModeAssistantReply = true;
  };

  const clearQueuedMixedModeAssistantReply = (): void => {
    conversationCtx.hasQueuedMixedModeAssistantReply = false;
  };

  const resetTurnCompletedFlag = (): void => {
    if (!hasOpenVoiceTurnFence(conversationCtx)) {
      conversationCtx.currentVoiceTurnId = null;
      conversationCtx.currentVoiceTurnState = 'idle';
      conversationCtx.lastSettledAssistantArtifactId = null;
    }
  };

  const attachCurrentAssistantTurn = (turnId: string | null): void => {
    if (!turnId) {
      return;
    }

    attachSettledVoiceAssistantTranscriptArtifact(conversationCtx, turnId);
  };

  return {
    currentAssistantArtifact,
    currentUserArtifact,
    hasSettledTurnFence,
    ensureAssistantTurn,
    queueMixedModeAssistantReply,
    clearQueuedMixedModeAssistantReply,
    resetTurnCompletedFlag,
    attachCurrentAssistantTurn,
  };
}
