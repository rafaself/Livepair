import { logRuntimeDiagnostic } from '../core/logger';
import { asErrorDetail } from '../core/runtimeUtils';
import {
  getEffectiveVoiceSessionCapabilities,
  getLiveConfig,
} from '../transport/liveConfig';
import { createTransportEventRouter } from '../transport/transportEventRouter';
import { createVoiceResumeController } from '../voice/session/voiceResumeController';
import { connectFallbackVoiceSession } from '../voice/session/connectFallbackVoiceSession';
import {
  buildRehydrationPacketFromCurrentChat,
} from '../../chatMemory/currentChatMemory';
import {
  endCurrentLiveSession,
  resolveCurrentChatLiveSessionVoice,
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
  setAssistantAnswerMetadata,
} from '../conversation/conversationTurnManager';
import type { ConversationContext } from '../conversation/conversationTurnManager';
import type {
  DesktopSessionControllerDependencies,
} from '../core/sessionControllerTypes';
import type { DesktopSession } from '../transport/transport.types';
import type { CreateEphemeralTokenResponse } from '@livepair/shared-types';
import type { createScreenCaptureController } from '../screen/screenCaptureController';
import type { createVoiceChunkPipeline } from '../voice/media/voiceChunkPipeline';
import type { createVoiceInterruptionController } from '../voice/session/voiceInterruptionController';
import type { createVoiceTokenManager } from '../voice/session/voiceTokenManager';
import type { createVoiceToolController } from '../voice/tools/voiceToolController';
import type { createVoiceTranscriptController } from '../voice/transcript/voiceTranscriptController';
import type { createSessionControllerMutableRuntime } from './sessionMutableRuntime';
import type { createSessionControllerRuntime } from './sessionRuntime';
import { createSessionTransportActivation } from './sessionTransportActivation';
import type { createLiveTelemetryCollector } from './liveTelemetryCollector';

type RuntimeRef = {
  current: ReturnType<typeof createSessionControllerRuntime> | null;
};

type TransportEvent = Parameters<Parameters<DesktopSession['subscribe']>[0]>[0];

type SessionTransportAssemblyArgs = {
  dependencies: DesktopSessionControllerDependencies;
  conversationCtx: ConversationContext;
  mutableRuntime: ReturnType<typeof createSessionControllerMutableRuntime>;
  telemetryCollector: ReturnType<typeof createLiveTelemetryCollector>;
  refreshScreenCaptureSourceSnapshot: () => Promise<boolean>;
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
  telemetryCollector,
  refreshScreenCaptureSourceSnapshot,
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
  const transportActivation = createSessionTransportActivation({
    cleanupTransport: () => runtimeRef.current!.cleanupTransport(),
    setActiveTransport: (transport) => runtimeRef.current!.setActiveTransport(transport),
    subscribeTransport: (transport, listener) =>
      runtimeRef.current!.subscribeTransport(transport, listener),
  });
  const transportRouter = createTransportEventRouter({
    store: dependencies.store,
    settingsStore: dependencies.settingsStore,
    logger: dependencies.logger,
    recordSessionEvent: (event) => runtimeRef.current!.recordSessionEvent(event),
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
      void updateCurrentLiveSession({
        kind: 'resumption',
        ...patch,
      });
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
    finalizeCurrentVoiceTurns: (finalizeReason) => {
      voiceTranscript.finalizeCurrentVoiceTurns(finalizeReason);
    },
    attachCurrentAssistantTurn: (turnId) => {
      voiceTranscript.attachCurrentAssistantTurn(turnId);
    },
    enqueueVoiceToolCalls: (calls) => runtimeRef.current!.enqueueVoiceToolCalls(calls),
    handleVoiceInterruption: () => runtimeRef.current!.handleVoiceInterruption(),
    applyVoiceTranscriptUpdate: (role, text, isFinal) =>
      runtimeRef.current!.applyVoiceTranscriptUpdate(role, text, isFinal),
    appendAssistantDraftTextDelta: (text) => {
      appendAssistantDraftTextDelta(conversationCtx, text);
    },
    setAssistantAnswerMetadata: (answerMetadata) => {
      setAssistantAnswerMetadata(conversationCtx, answerMetadata);
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
      const settledAssistantTranscript = settledAssistantArtifact?.content?.trim() ?? '';
      const shouldUseSettledAssistantTranscript = settledAssistantTranscript.length > 0;
      const completedDraftText = draft?.content?.trim() ?? '';

      // Persist the settled spoken transcript when Gemini supplies one.
      // Keep the completed text-delta draft only as a fallback for flows
      // where no settled assistant transcript arrived.
      const turnContent = shouldUseSettledAssistantTranscript
        ? settledAssistantTranscript
        : draft?.content ?? null;
      const answerMetadataBase = draft?.answerMetadata ?? conversationCtx.pendingAssistantAnswerMetadata ?? undefined;
      const answerMetadata = shouldUseSettledAssistantTranscript && completedDraftText.length > 0
        ? {
            provenance: answerMetadataBase?.provenance ?? 'unverified',
            ...(answerMetadataBase?.citations ? { citations: answerMetadataBase.citations } : {}),
            ...(answerMetadataBase?.confidence ? { confidence: answerMetadataBase.confidence } : {}),
            ...(answerMetadataBase?.reason ? { reason: answerMetadataBase.reason } : {}),
            thinkingText: completedDraftText,
          }
        : answerMetadataBase;
      const assistantTurnId = turnContent
        ? appendCompletedAssistantTurn(conversationCtx, turnContent, {
            ...(answerMetadata ? { answerMetadata } : {}),
            source: 'voice',
            ...(shouldUseSettledAssistantTranscript
              && settledAssistantArtifact?.transcriptFinal !== undefined
              ? { transcriptFinal: settledAssistantArtifact.transcriptFinal }
              : {}),
            ...(settledAssistantArtifact?.timelineOrdinal !== undefined
              ? { timelineOrdinal: settledAssistantArtifact.timelineOrdinal }
              : {}),
          })
        : null;

      conversationCtx.pendingAssistantAnswerMetadata = null;

      if (assistantTurnId) {
        if (answerMetadata) {
          logRuntimeDiagnostic('voice-session', 'assistant answer committed', {
            provenance: answerMetadata.provenance,
            ...(answerMetadata.confidence ? { confidence: answerMetadata.confidence } : {}),
          });
        }
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
    shouldIgnoreAssistantOutput: (eventType, options) =>
      runtimeRef.current!.shouldIgnoreAssistantOutput(eventType, options),
    deriveTurnCompleteEvent: () => runtimeRef.current!.deriveTurnCompleteEvent(),
    setVoiceErrorState: (detail) => setVoiceErrorState(detail),
    cleanupTransport: () => runtimeRef.current!.cleanupTransport(),
    resumeVoiceSession: (detail) => voiceResumeCtrl.resume(detail),
    updateVoiceLiveSignalDiagnostics: (patch) => {
      dependencies.store.getState().updateVoiceLiveSignalDiagnostics(patch);
    },
    getActiveLiveCapabilities: () => {
      try {
        return getEffectiveVoiceSessionCapabilities(getLiveConfig());
      } catch {
        return null;
      }
    },
    restoreScreenCapture: () => {
      void refreshScreenCaptureSourceSnapshot().then((didRefresh) => {
        if (!didRefresh) {
          return;
        }

        return screenCtrl.start();
      });
    },
  });
  const { handleTransportEvent: routeTransportEvent } = transportRouter;
  const handleTransportEvent = (event: TransportEvent): void => {
    switch (event.type) {
      case 'connection-state-changed':
        if (event.state === 'connected') {
          telemetryCollector.onSessionConnected();
        }
        break;
      case 'usage-metadata':
        telemetryCollector.onUsageMetadata(event.usage);
        break;
      case 'interrupted':
        telemetryCollector.onInterruption();
        break;
      case 'text-delta':
      case 'audio-chunk':
      case 'output-transcript':
      case 'answer-metadata':
      case 'tool-call':
        telemetryCollector.onResponseStarted();
        break;
      default:
        break;
    }

    routeTransportEvent(event);
  };

  const refreshVoiceSessionToken = (
    operationId: number,
    detail: string,
  ): Promise<CreateEphemeralTokenResponse | null> => {
    return tokenMgr.refresh(operationId, detail);
  };

  const voiceResumeCtrl = createVoiceResumeController({
    store: dependencies.store,
    transportAdapter: dependencies.transportAdapter,
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
          kind: 'resumption',
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
        resolveSessionVoice: () =>
          resolveCurrentChatLiveSessionVoice(
            dependencies.settingsStore.getState().settings.voice,
          ),
        transportAdapter: dependencies.transportAdapter,
        createPersistedLiveSession: async (voice) => {
          await startCurrentLiveSession({ voicePreference: voice });
        },
        activateVoiceTransport: (transport) => {
          transportActivation.activateTransport(transport, handleTransportEvent);
        },
        setVoiceResumptionInFlight: (value) => {
          runtimeRef.current!.setVoiceResumptionInFlight(value);
        },
        recordSessionEvent: (event) => {
          runtimeRef.current!.recordSessionEvent(event);
        },
      });
    },
    stopScreenCapture: () => runtimeRef.current!.stopScreenCaptureInternal(),
    stopVoicePlayback: () => runtimeRef.current!.stopVoicePlayback(),
    subscribeTransport: (transport, listener) => {
      runtimeRef.current!.subscribeTransport(transport, listener);
    },
    handleTransportEvent: (event) => handleTransportEvent(event),
    onResumeConnected: () => {
      telemetryCollector.onSessionResumed();
    },
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
