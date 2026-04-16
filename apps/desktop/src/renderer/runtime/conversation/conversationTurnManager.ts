// ---------------------------------------------------------------------------
// Barrel — re-exports the full public surface of the conversation turn manager.
//
// Consumers should continue importing from this file. The implementation is
// split by responsibility across three modules:
//   - conversationContext.ts        (context bag, fence helpers, user turns)
//   - assistantDraftLifecycle.ts    (assistant draft + pending turn lifecycle)
//   - voiceTranscriptArtifactLifecycle.ts (voice transcript artifacts)
// ---------------------------------------------------------------------------

export type {
  AssistantDraftModel,
  ConversationContext,
  VoiceTurnFenceState,
} from './conversationContext';

export {
  appendUserTurn,
  beginVoiceTurnFence,
  clearCurrentVoiceTurns,
  createConversationContext,
  getConversationTurn,
  getTranscriptArtifact,
  hasOpenVoiceTurnFence,
  settleVoiceTurnFence,
} from './conversationContext';

export {
  appendAssistantDraftTextDelta,
  appendAssistantTurn,
  appendCompletedAssistantTurn,
  clearAssistantDraft,
  clearPendingAssistantTurn,
  completeAssistantDraft,
  completePendingAssistantTurn,
  consumeCompletedAssistantDraft,
  failPendingAssistantTurn,
  interruptAssistantDraft,
  setAssistantAnswerMetadata,
  updatePendingAssistantTurn,
} from './assistantDraftLifecycle';

export {
  attachSettledVoiceAssistantTranscriptArtifact,
  finalizeCurrentVoiceAssistantTranscriptArtifact,
  finalizeCurrentVoiceUserTranscriptArtifact,
  interruptCurrentVoiceAssistantTranscriptArtifact,
  upsertCurrentVoiceAssistantTranscriptArtifact,
  upsertCurrentVoiceUserTranscriptArtifact,
  updateSettledVoiceUserTranscriptArtifact,
} from './voiceTranscriptArtifactLifecycle';
