import { logRuntimeDiagnostic } from '../core/logger';
import { asErrorDetail } from '../core/runtimeUtils';
import { LIVE_ADAPTER_KEY } from '../transport/liveConfig';
import { createTransportEventRouter } from '../transport/transportEventRouter';
import { createVoiceResumeController } from '../voice/voiceResumeController';
import { connectFallbackVoiceSession } from '../voice/connectFallbackVoiceSession';
import {
  buildRehydrationPacketFromCurrentChat,
} from '../../chatMemory/currentChatMemory';
import {
  endCurrentLiveSession,
  startCurrentLiveSession,
  updateCurrentLiveSession,
} from '../../liveSessions/currentLiveSession';
import {
  appendAssistantDraftTextDelta,
  appendCompletedAssistantTurn,
  clearAssistantDraft,
  clearPendingAssistantTurn,
  completeAssistantDraft,
  consumeCompletedAssistantDraft,
  getTranscriptArtifact,
  hasOpenVoiceTurnFence,
  interruptAssistantDraft,
} from '../conversation/conversationTurnManager';
import type { ConversationContext } from '../conversation/conversationTurnManager';
import type {
  DesktopSessionControllerDependencies,
} from '../core/sessionControllerTypes';
import type { DesktopSession } from '../transport/transport.types';
import type { CreateEphemeralTokenResponse } from '@livepair/shared-types';
import type { createScreenCaptureController } from '../screen/screenCaptureController';
import type { createVoiceChunkPipeline } from '../voice/voiceChunkPipeline';
import type { createVoiceInterruptionController } from '../voice/voiceInterruptionController';
import type { createVoiceTokenManager } from '../voice/voiceTokenManager';
import type { createVoiceToolController } from '../voice/voiceToolController';
import type { createVoiceTranscriptController } from '../voice/voiceTranscriptController';
import type { createSessionControllerMutableRuntime } from './sessionMutableRuntime';
import type { createSessionControllerRuntime } from './sessionRuntime';

type RuntimeRef = {
  current: ReturnType<typeof createSessionControllerRuntime> | null;
};

type TransportEvent = Parameters<Parameters<DesktopSession['subscribe']>[0]>[0];

type SessionTransportAssemblyArgs = {
  dependencies: DesktopSessionControllerDependencies;
  conversationCtx: ConversationContext;
  mutableRuntime: ReturnType<typeof createSessionControllerMutableRuntime>;
  runtimeRef: RuntimeRef;
  voiceToolCtrl: ReturnType<typeof createVoiceToolController>;
  voiceTranscript: ReturnType<typeof createVoiceTranscriptController>;
  voiceChunkCtrl: ReturnType<typeof createVoiceChunkPipeline>;
  screenCtrl: ReturnType<typeof createScreenCaptureController>;
  interruptionCtrl: ReturnType<typeof createVoiceInterruptionController>;
  tokenMgr: ReturnType<typeof createVoiceTokenManager>;
  setVoiceErrorState: (detail: string) => void;
  persistSettledConversationTurn: (turnId: string) => void;
};

export function createSessionTransportAssembly({
  dependencies,
  conversationCtx,
  mutableRuntime,
  runtimeRef,
  voiceToolCtrl,
  voiceTranscript,
  voiceChunkCtrl,
  screenCtrl,
  interruptionCtrl,
  tokenMgr,
  setVoiceErrorState,
  persistSettledConversationTurn,
}: SessionTransportAssemblyArgs): {
  handleTransportEvent: (event: TransportEvent) => void;
  requestVoiceSessionToken: (
    operationId: number,
  ) => Promise<CreateEphemeralTokenResponse | null>;
} {
  const transportRouter = createTransportEventRouter({
    store: dependencies.store,
    settingsStore: dependencies.settingsStore,
    logger: dependencies.logger,
    logRuntimeDiagnostic,
    isVoiceResumptionInFlight: () => runtimeRef.current!.getVoiceResumptionInFlight(),
    setVoiceResumptionInFlight: (value) => {
      runtimeRef.current!.setVoiceResumptionInFlight(value);
    },
    currentVoiceSessionStatus: () => runtimeRef.current!.currentVoiceSessionStatus(),
    currentSpeechLifecycleStatus: () => runtimeRef.current!.currentSpeechLifecycleStatus(),
    getToken: () => tokenMgr.get(),
    setVoiceSessionStatus: (status) => runtimeRef.current!.setVoiceSessionStatus(status),
    setVoiceSessionResumption: (patch) => runtimeRef.current!.setVoiceSessionResumption(patch),
    setVoiceSessionDurability: (patch) => runtimeRef.current!.setVoiceSessionDurability(patch),
    persistLiveSessionResumption: (patch) => {
      void updateCurrentLiveSession(patch);
    },
    syncVoiceDurabilityState: (token, patch) => runtimeRef.current!.syncVoiceDurabilityState(token, patch),
    setVoicePlaybackState: (state) => runtimeRef.current!.setVoicePlaybackState(state),
    updateVoicePlaybackDiagnostics: (patch) => runtimeRef.current!.updateVoicePlaybackDiagnostics(patch),
    getVoicePlayback: () => runtimeRef.current!.getVoicePlayback(),
    stopVoicePlayback: (state) => runtimeRef.current!.stopVoicePlayback(state),
    cancelVoiceToolCalls: (detail) => {
      voiceToolCtrl.cancel(detail);
    },
    resetVoiceToolState: () => runtimeRef.current!.resetVoiceToolState(),
    resetVoiceTurnTranscriptState: () => runtimeRef.current!.resetVoiceTurnTranscriptState(),
    ensureAssistantVoiceTurn: () => {
      return voiceTranscript.ensureAssistantTurn();
    },
    finalizeCurrentVoiceTurns: (finalizeReason, options) => {
      voiceTranscript.finalizeCurrentVoiceTurns(finalizeReason, options);
    },
    attachCurrentAssistantTurn: (turnId) => {
      voiceTranscript.attachCurrentAssistantTurn(turnId);
    },
    enqueueVoiceToolCalls: (calls) => runtimeRef.current!.enqueueVoiceToolCalls(calls),
    handleVoiceInterruption: () => runtimeRef.current!.handleVoiceInterruption(),
    applySpeechLifecycleEvent: (event) => runtimeRef.current!.applySpeechLifecycleEvent(event),
    applyVoiceTranscriptUpdate: (role, text, isFinal) =>
      runtimeRef.current!.applyVoiceTranscriptUpdate(role, text, isFinal),
    appendAssistantDraftTextDelta: (text) => {
      appendAssistantDraftTextDelta(conversationCtx, text);
    },
    completeAssistantDraft: () => {
      completeAssistantDraft(conversationCtx);
    },
    interruptAssistantDraft: () => {
      interruptAssistantDraft(conversationCtx);
    },
    discardAssistantDraft: () => {
      clearAssistantDraft(conversationCtx);
    },
    commitAssistantDraft: () => {
      const draft = consumeCompletedAssistantDraft(conversationCtx);
      const settledAssistantArtifact = conversationCtx.lastSettledAssistantArtifactId
        ? getTranscriptArtifact(conversationCtx, conversationCtx.lastSettledAssistantArtifactId)
        : null;
      const assistantTurnId = draft
        ? appendCompletedAssistantTurn(conversationCtx, draft.content, {
            source: 'voice',
            ...(settledAssistantArtifact?.timelineOrdinal !== undefined
              ? { timelineOrdinal: settledAssistantArtifact.timelineOrdinal }
              : {}),
          })
        : null;

      if (assistantTurnId) {
        persistSettledConversationTurn(assistantTurnId);
      }

      return assistantTurnId;
    },
    hasOpenVoiceTurnFence: () => {
      return hasOpenVoiceTurnFence(conversationCtx);
    },
    hasPendingVoiceToolCall: () => {
      return dependencies.store.getState().voiceToolState.status !== 'idle';
    },
    hasActiveAssistantVoiceTurn: () => {
      return conversationCtx.currentVoiceAssistantArtifactId !== null;
    },
    hasQueuedMixedModeAssistantReply: () => {
      return conversationCtx.hasQueuedMixedModeAssistantReply;
    },
    hasStreamingAssistantVoiceTurn: () => {
      const currentAssistantArtifactId = conversationCtx.currentVoiceAssistantArtifactId;

      if (!currentAssistantArtifactId) {
        return false;
      }

      return (
        dependencies.store
          .getState()
          .transcriptArtifacts.find((artifact) => artifact.id === currentAssistantArtifactId)
          ?.state === 'streaming'
      );
    },
    setVoiceErrorState: (detail) => setVoiceErrorState(detail),
    cleanupTransport: () => runtimeRef.current!.cleanupTransport(),
    resumeVoiceSession: (detail) => voiceResumeCtrl.resume(detail),
  });
  const { handleTransportEvent } = transportRouter;

  const refreshVoiceSessionToken = (
    operationId: number,
    detail: string,
  ): Promise<CreateEphemeralTokenResponse | null> => {
    return tokenMgr.refresh(operationId, detail);
  };

  const voiceResumeCtrl = createVoiceResumeController({
    store: dependencies.store,
    createTransport: dependencies.createTransport,
    getToken: () => tokenMgr.get(),
    beginSessionOperation: () => runtimeRef.current!.beginSessionOperation(),
    isCurrentSessionOperation: (operationId) => runtimeRef.current!.isCurrentSessionOperation(operationId),
    logRuntimeDiagnostic,
    setVoiceSessionStatus: (status) => runtimeRef.current!.setVoiceSessionStatus(status),
    setVoiceSessionResumption: (patch) => runtimeRef.current!.setVoiceSessionResumption(patch),
    setVoiceSessionDurability: (patch) => runtimeRef.current!.setVoiceSessionDurability(patch),
    setVoiceErrorState: (detail) => setVoiceErrorState(detail),
    setVoiceResumptionInFlight: (value) => {
      runtimeRef.current!.setVoiceResumptionInFlight(value);
    },
    refreshToken: (operationId, detail) => refreshVoiceSessionToken(operationId, detail),
    fallbackToNewSession: async (operationId, token, detail) => {
      const invalidatedAt = new Date().toISOString();

      try {
        await updateCurrentLiveSession({
          restorable: false,
          invalidatedAt,
          invalidationReason: detail,
        });
        await endCurrentLiveSession({
          status: 'failed',
          endedReason: detail,
        });
      } catch (error) {
        return {
          status: 'failed' as const,
          detail: asErrorDetail(error, 'Failed to retire replaced Live session'),
        };
      }

      return connectFallbackVoiceSession({
        operationId,
        token,
        reason: 'resume-failed',
        previousDetail: detail,
        logRuntimeDiagnostic,
        buildRehydrationPacketFromCurrentChat,
        isCurrentSessionOperation: (id) => runtimeRef.current!.isCurrentSessionOperation(id),
        createTransport: () => dependencies.createTransport(LIVE_ADAPTER_KEY),
        createPersistedLiveSession: async () => {
          await startCurrentLiveSession();
        },
        activateVoiceTransport: (transport) => {
          runtimeRef.current!.cleanupTransport();
          runtimeRef.current!.setActiveTransport(transport);
          runtimeRef.current!.subscribeTransport(transport, handleTransportEvent);
        },
        setVoiceResumptionInFlight: (value) => {
          runtimeRef.current!.setVoiceResumptionInFlight(value);
        },
        startVoiceCapture: () => voiceChunkCtrl.startCapture({ shutdownOnFailure: true }),
        applySpeechLifecycleEvent: (event) => {
          runtimeRef.current!.applySpeechLifecycleEvent(event);
        },
      });
    },
    stopScreenCapture: () => runtimeRef.current!.stopScreenCaptureInternal(),
    stopVoicePlayback: () => runtimeRef.current!.stopVoicePlayback(),
    subscribeTransport: (transport, listener) => {
      runtimeRef.current!.subscribeTransport(transport, listener);
    },
    handleTransportEvent: (event) => handleTransportEvent(event),
    getActiveTransport: () => runtimeRef.current!.getActiveTransport(),
    setActiveTransport: (transport) => {
      runtimeRef.current!.setActiveTransport(transport);
    },
    unsubscribePreviousTransport: () => {
      mutableRuntime.clearTransportSubscription();
    },
    resetTransportDeps: () => {
      voiceChunkCtrl.resetSendChain();
      voiceToolCtrl.cancel('voice transport replaced');
      screenCtrl.resetSendChain();
      interruptionCtrl.reset();
      // Transport replacement abandons any uncommitted assistant draft. Only
      // turn-complete is allowed to finalize a normal assistant draft commit.
      clearPendingAssistantTurn(conversationCtx);
      voiceTranscript.resetTurnCompletedFlag();
    },
  });

  const requestVoiceSessionToken = (
    operationId: number,
  ): Promise<CreateEphemeralTokenResponse | null> => {
    return tokenMgr.request(operationId);
  };

  return {
    handleTransportEvent,
    requestVoiceSessionToken,
  };
}
