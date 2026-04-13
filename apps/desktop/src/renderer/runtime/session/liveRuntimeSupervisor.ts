import { logRuntimeError } from '../core/logger';
import { getLiveConfig } from '../transport/liveConfig';
import {
  buildRehydrationPacketFromCurrentChat,
  getCurrentChat,
} from '../../chatMemory/currentChatMemory';
import {
  endCurrentLiveSession,
  resolveCurrentChatLiveSessionVoice,
  restoreCurrentLiveSession,
  startCurrentLiveSession,
  updateCurrentLiveSession,
} from '../../liveSessions/currentLiveSession';
import { failPendingAssistantTurn as failConversationPendingAssistantTurn } from '../conversation/conversationTurnManager';
import type { ConversationContext } from '../conversation/conversationTurnManager';
import type {
  DesktopSessionController,
  DesktopSessionControllerDependencies,
} from '../core/sessionControllerTypes';
import type { ProductMode, SessionCommand } from '../core/session.types';
import type { TextSessionStatus } from '../text/text.types';
import type { LiveSessionRecord } from '@livepair/shared-types';
import type { createVoicePlaybackController } from '../voice/media/voicePlaybackController';
import type { createVoiceChunkPipeline } from '../voice/media/voiceChunkPipeline';
import type { createVoiceInterruptionController } from '../voice/session/voiceInterruptionController';
import type { createVoiceTokenManager } from '../voice/session/voiceTokenManager';
import type { createVoiceToolController } from '../voice/tools/voiceToolController';
import type { createVoiceTranscriptController } from '../voice/transcript/voiceTranscriptController';
import type { createSessionControllerMutableRuntime } from './sessionMutableRuntime';
import type { createSessionControllerRuntime } from './sessionRuntime';
import type { LiveRuntimeScreenAdapter } from '../screen/screenAdapter';
import { createSessionControllerErrorHandling } from './sessionErrorHandling';
import {
  createSessionControllerEndings,
  type EndSessionInternal,
} from './sessionEndings';
import { createSessionControllerLifecycle } from './sessionLifecycle';
import { createSessionControllerModeSwitching } from './sessionModeSwitching';
import { createSessionControllerPublicApi } from './sessionPublicApi';
import { createSessionControllerTeardown } from './sessionTeardown';
import { createSessionTransportActivation } from './sessionTransportActivation';
import { createSessionTransportAssembly } from './sessionTransportAssembly';
import type { createLiveRuntimeObservability } from './liveRuntimeObservability';

type RuntimeRef = {
  current: ReturnType<typeof createSessionControllerRuntime> | null;
};

type LiveRuntimeSupervisorArgs = {
  dependencies: DesktopSessionControllerDependencies;
  conversationCtx: ConversationContext;
  mutableRuntime: ReturnType<typeof createSessionControllerMutableRuntime>;
  runtimeRef: RuntimeRef;
  observability: ReturnType<typeof createLiveRuntimeObservability>;
  runtimeEnvironment: DesktopSessionControllerDependencies['runtimeEnvironment'];
  playbackCtrl: ReturnType<typeof createVoicePlaybackController>;
  screen: LiveRuntimeScreenAdapter;
  voiceChunkCtrl: ReturnType<typeof createVoiceChunkPipeline>;
  voiceToolCtrl: ReturnType<typeof createVoiceToolController>;
  voiceTranscript: ReturnType<typeof createVoiceTranscriptController>;
  interruptionCtrl: ReturnType<typeof createVoiceInterruptionController>;
  tokenMgr: ReturnType<typeof createVoiceTokenManager>;
  appendTypedUserTurn: (text: string) => string;
  refreshScreenCaptureSourceSnapshot: () => Promise<boolean>;
  selectedOutputDeviceId: () => string;
  setVoiceErrorState: (detail: string) => void;
  settleVoiceErrorState: (detail: string) => Promise<void>;
  persistSettledConversationTurn: (turnId: string) => void;
};

export type LiveRuntimeSupervisor = {
  publicApi: DesktopSessionController;
  endSessionInternal: EndSessionInternal;
  voiceErrorHandlers: ReturnType<typeof createSessionControllerErrorHandling>;
};

export function createLiveRuntimeSupervisor({
  dependencies,
  conversationCtx,
  mutableRuntime,
  runtimeRef,
  observability,
  runtimeEnvironment,
  playbackCtrl,
  screen,
  voiceChunkCtrl,
  voiceToolCtrl,
  voiceTranscript,
  interruptionCtrl,
  tokenMgr,
  appendTypedUserTurn,
  refreshScreenCaptureSourceSnapshot,
  selectedOutputDeviceId,
  setVoiceErrorState,
  settleVoiceErrorState,
  persistSettledConversationTurn,
}: LiveRuntimeSupervisorArgs): LiveRuntimeSupervisor {
  const startTelemetrySession = (liveSession: LiveSessionRecord): void => {
    observability.onSessionStarted({
      sessionId: liveSession.id,
      chatId: liveSession.chatId,
      model: getLiveConfig().model,
      environment: runtimeEnvironment.environment,
      platform: runtimeEnvironment.platform,
      appVersion: runtimeEnvironment.appVersion,
    });
  };

  const { handleTransportEvent, requestVoiceSessionToken } = createSessionTransportAssembly({
    dependencies,
    conversationCtx,
    mutableRuntime,
    observability,
    refreshScreenCaptureSourceSnapshot,
    runtimeRef,
    voiceToolCtrl,
    voiceTranscript,
    voiceChunkCtrl,
    screen,
    interruptionCtrl,
    tokenMgr,
    setVoiceErrorState,
    persistSettledConversationTurn,
  });

  const teardown = createSessionControllerTeardown({
    store: dependencies.store,
    currentSpeechLifecycleStatus: () => runtimeRef.current!.currentSpeechLifecycleStatus(),
    currentTextSessionStatus: () => runtimeRef.current!.currentTextSessionStatus(),
    applySessionEvent: (event) => {
      runtimeRef.current!.applySessionEvent(event);
    },
    clearToken: () => {
      tokenMgr.clear();
    },
    clearCurrentVoiceTranscript: () => runtimeRef.current!.clearCurrentVoiceTranscript(),
    cleanupTransport: () => runtimeRef.current!.cleanupTransport(),
    getActiveTransport: () => runtimeRef.current!.getActiveTransport(),
    getVoiceCapture: () => voiceChunkCtrl.getVoiceCapture(),
    hasActiveTextStream: () => false,
    hasScreenCapture: () => screen.capture.isActive(),
    hasTextRuntimeActivity: () => false,
    hasVoiceCapture: () => voiceChunkCtrl.hasCapture(),
    hasVoicePlayback: () => playbackCtrl.isActive(),
    resetRuntimeState: (textSessionStatus, options) =>
      runtimeRef.current!.resetRuntimeState(textSessionStatus, options),
    resetVoiceSessionDurability: () => runtimeRef.current!.resetVoiceSessionDurability(),
    resetVoiceSessionResumption: () => runtimeRef.current!.resetVoiceSessionResumption(),
    resetVoiceToolState: () => runtimeRef.current!.resetVoiceToolState(),
    setVoiceCaptureState: (state) => {
      dependencies.store.getState().setVoiceCaptureState(state);
    },
    setVoicePlaybackState: (state) => {
      dependencies.store.getState().setVoicePlaybackState(state);
    },
    setVoiceResumptionInFlight: (value) => {
      runtimeRef.current!.setVoiceResumptionInFlight(value);
    },
    setVoiceSessionDurability: (value) => {
      dependencies.store.getState().setVoiceSessionDurability(value);
    },
    setVoiceSessionResumption: (value) => {
      dependencies.store.getState().setVoiceSessionResumption(value);
    },
    setVoiceToolStateSnapshot: (value) => {
      dependencies.store.getState().setVoiceToolState(value);
    },
    stopScreenCaptureInternal: () => runtimeRef.current!.stopScreenCaptureInternal(),
    stopVoiceCapture: async () => {
      await voiceChunkCtrl.flush();
    },
    stopVoicePlayback: () => runtimeRef.current!.stopVoicePlayback(),
    textDisconnectRequested: () => undefined,
  });

  const teardownActiveRuntime = async (
    {
      textSessionStatus = 'disconnected',
      preserveLastRuntimeError = null,
      preserveVoiceRuntimeDiagnostics = false,
      preserveConversationTurns = false,
    }: {
      textSessionStatus?: TextSessionStatus;
      preserveLastRuntimeError?: string | null;
      preserveVoiceRuntimeDiagnostics?: boolean;
      preserveConversationTurns?: boolean;
    } = {},
  ): Promise<void> => {
    await teardown.teardownActiveRuntime({
      textSessionStatus,
      preserveLastRuntimeError,
      preserveVoiceRuntimeDiagnostics,
      preserveConversationTurns,
    });
  };

  const transportActivation = createSessionTransportActivation({
    cleanupTransport: () => runtimeRef.current!.cleanupTransport(),
    setActiveTransport: (transport) => runtimeRef.current!.setActiveTransport(transport),
    subscribeTransport: (transport, listener) =>
      runtimeRef.current!.subscribeTransport(transport, listener),
  });

  let ensureExclusiveMode = async (
    _targetMode: ProductMode,
    _operationId: number,
  ): Promise<void> => {
    throw new Error('ensureExclusiveMode called before initialization');
  };

  const lifecycle = createSessionControllerLifecycle({
    store: dependencies.store,
    beginSessionOperation: () => runtimeRef.current!.beginSessionOperation(),
    handleSessionCommand: (command) => runtimeRef.current!.handleSessionCommand(command),
    isCurrentSessionOperation: (operationId) =>
      runtimeRef.current!.isCurrentSessionOperation(operationId),
    ensureExclusiveMode: (targetMode, operationId) =>
      ensureExclusiveMode(targetMode, operationId),
    recordSessionEvent: (event) => runtimeRef.current!.recordSessionEvent(event),
    setVoiceCaptureState: (state) => {
      dependencies.store.getState().setVoiceCaptureState(state);
    },
    setVoiceCaptureDiagnostics: (patch) => {
      dependencies.store.getState().setVoiceCaptureDiagnostics(patch);
    },
    setVoicePlaybackState: (state) => {
      runtimeRef.current!.setVoicePlaybackState(state);
    },
    updateVoicePlaybackDiagnostics: (patch) => {
      runtimeRef.current!.updateVoicePlaybackDiagnostics(patch);
    },
    currentGroundingEnabled: () => dependencies.settingsStore.getState().settings.groundingEnabled,
    setActiveVoiceSessionGroundingEnabled: (enabled) => {
      dependencies.store.getState().setActiveVoiceSessionGroundingEnabled(enabled);
    },
    selectedOutputDeviceId,
    resetVoiceSessionResumption: () => runtimeRef.current!.resetVoiceSessionResumption(),
    resetVoiceSessionDurability: () => runtimeRef.current!.resetVoiceSessionDurability(),
    resetVoiceToolState: () => runtimeRef.current!.resetVoiceToolState(),
    ensureCurrentChatForSpeechStart: async () => {
      await getCurrentChat();
    },
    requestVoiceSessionToken,
    buildRehydrationPacketFromCurrentChat,
    setCachedVoiceToken: (token) => {
      tokenMgr.set(token);
    },
    syncVoiceDurabilityState: (token, patch) =>
      runtimeRef.current!.syncVoiceDurabilityState(token, patch),
    restorePersistedLiveSession: async () => {
      const liveSession = await restoreCurrentLiveSession();

      if (liveSession) {
        startTelemetrySession(liveSession);
      }

      return liveSession;
    },
    onRestoredSessionConnected: () => {
      observability.onSessionResumed();
    },
    invalidatePersistedLiveSession: async (patch) => {
      await updateCurrentLiveSession({
        kind: 'resumption',
        ...patch,
      });
    },
    resolveSessionVoice: () =>
      resolveCurrentChatLiveSessionVoice(
        dependencies.settingsStore.getState().settings.voice,
      ),
    createPersistedLiveSession: async (voice) => {
      const liveSession = await startCurrentLiveSession({ voicePreference: voice });
      startTelemetrySession(liveSession);
      observability.onSessionConnected();
    },
    endPersistedLiveSession: async (liveSessionEnd) => {
      if (liveSessionEnd.status === 'failed' && liveSessionEnd.endedReason) {
        observability.onSessionError({
          detail: liveSessionEnd.endedReason,
        });
      }

      observability.onSessionEnded({
        closeReason: liveSessionEnd.endedReason ?? null,
      });
      await endCurrentLiveSession(liveSessionEnd);
    },
    setVoiceResumptionInFlight: (value) => {
      runtimeRef.current!.setVoiceResumptionInFlight(value);
    },
    transportAdapter: dependencies.transportAdapter,
    activateVoiceTransport: (transport) => {
      transportActivation.activateTransport(transport, handleTransportEvent);
    },
    startVoiceCapture: () => voiceChunkCtrl.startCapture(),
    setVoiceErrorState: (detail) => {
      observability.onSessionError({
        detail,
        name: 'session-error',
      });
      return settleVoiceErrorState(detail);
    },
    checkBackendHealth: () => dependencies.checkBackendHealth(),
    textRuntimeFailed: () => undefined,
    emitDiagnostic: (event) => observability.emitDiagnostic(event),
  });

  const { endSessionInternal, endSpeechModeInternal } = createSessionControllerEndings({
    beginSessionOperation: () => runtimeRef.current!.beginSessionOperation(),
    recordSessionEvent: (event) => runtimeRef.current!.recordSessionEvent(event),
    teardownActiveRuntime,
    endLiveSession: async (liveSessionEnd) => {
      if (liveSessionEnd.status === 'failed' && liveSessionEnd.endedReason) {
        observability.onSessionError({
          detail: liveSessionEnd.endedReason,
        });
      }

      observability.onSessionEnded({
        closeReason: liveSessionEnd.endedReason ?? null,
      });
      await endCurrentLiveSession(liveSessionEnd);
    },
    setCurrentMode: (mode) => runtimeRef.current!.setCurrentMode(mode),
  });

  const voiceErrorHandlers = createSessionControllerErrorHandling({
    applySessionEvent: (event) => {
      runtimeRef.current!.applySessionEvent(event);
    },
    clearToken: () => {
      tokenMgr.clear();
    },
    cleanupTransport: () => runtimeRef.current!.cleanupTransport(),
    endSessionInternal: (options) => endSessionInternal(options),
    emitDiagnostic: (event) => observability.emitDiagnostic(event),
    resetVoiceTurnTranscriptState: () => runtimeRef.current!.resetVoiceTurnTranscriptState(),
    setLastRuntimeError: (detail) => {
      dependencies.store.getState().setLastRuntimeError(detail);
    },
    setAssistantActivity: (activity) => {
      dependencies.store.getState().setAssistantActivity(activity);
    },
    setActiveTransport: (transport) => {
      dependencies.store.getState().setActiveTransport(transport);
    },
    setCurrentMode: (mode) => {
      dependencies.store.getState().setCurrentMode(mode);
    },
    setVoiceResumptionInFlight: (value) => {
      runtimeRef.current!.setVoiceResumptionInFlight(value);
    },
    getVoiceSessionResumptionStatus: () =>
      dependencies.store.getState().voiceSessionResumption.status,
    setVoiceSessionResumption: (patch) => {
      runtimeRef.current!.setVoiceSessionResumption(patch);
    },
    setVoiceToolState: (patch) => {
      runtimeRef.current!.setVoiceToolState(patch);
    },
    textRuntimeFailed: () => undefined,
    failPendingAssistantTurn: (statusLabel) => {
      failConversationPendingAssistantTurn(conversationCtx, statusLabel);
    },
  });

  const modeSwitching = createSessionControllerModeSwitching({
    currentProductMode: () => runtimeRef.current!.currentProductMode(),
    hasSpeechRuntimeActivity: () => teardown.hasSpeechRuntimeActivity(),
    hasTextRuntimeActivity: () => false,
    isCurrentSessionOperation: (operationId) =>
      runtimeRef.current!.isCurrentSessionOperation(operationId),
    setCurrentMode: (mode) => {
      runtimeRef.current!.setCurrentMode(mode);
    },
    teardownActiveRuntime: (options) => teardownActiveRuntime(options),
  });

  ensureExclusiveMode = async (
    targetMode: ProductMode,
    operationId: number,
  ): Promise<void> => {
    await modeSwitching.ensureExclusiveMode(targetMode, operationId);
  };

  return {
    publicApi: createSessionControllerPublicApi({
      store: dependencies.store,
      supervisor: {
        checkBackendHealth: async () => {
          await lifecycle.performBackendHealthCheck();
        },
        startSession: lifecycle.startSessionInternal,
        endSession: () => endSessionInternal({ recordEvents: true }),
        endSpeechMode: () => endSpeechModeInternal({ recordEvents: true }),
      },
      voiceChunkCtrl,
      screenCtrl: screen.capture,
      refreshScreenCaptureSourceSnapshot,
      appendTypedUserTurn,
      voiceTranscriptCtrl: {
        queueMixedModeAssistantReply: () => {
          voiceTranscript.queueMixedModeAssistantReply();
        },
        clearQueuedMixedModeAssistantReply: () => {
          voiceTranscript.clearQueuedMixedModeAssistantReply();
        },
      },
      runtime: {
        currentSpeechLifecycleStatus: () => runtimeRef.current!.currentSpeechLifecycleStatus(),
        handleSessionCommand: (command: SessionCommand) =>
          runtimeRef.current!.handleSessionCommand(command),
        getActiveTransport: () => runtimeRef.current!.getActiveTransport(),
        getRealtimeOutboundGateway: () => runtimeRef.current!.getRealtimeOutboundGateway(),
        recordSessionEvent: (event) => runtimeRef.current!.recordSessionEvent(event),
        setVoiceErrorState: (detail) => setVoiceErrorState(detail),
        syncSpeechSilenceTimeout: (status) => runtimeRef.current!.syncSpeechSilenceTimeout(status),
      },
      logRuntimeError,
      onCommand: (command: SessionCommand) => {
        observability.emitDiagnostic({
          scope: 'session',
          name: 'command-dispatched',
          data: {
            commandType: command.type,
          },
        });
      },
    }),
    endSessionInternal,
    voiceErrorHandlers,
  };
}
