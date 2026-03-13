import { logRuntimeDiagnostic, logRuntimeError } from '../core/logger';
import { LIVE_ADAPTER_KEY } from '../transport/liveConfig';
import {
  buildRehydrationPacketFromCurrentChat,
} from '../../chatMemory/currentChatMemory';
import {
  endCurrentLiveSession,
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
import type { ProductMode } from '../core/session.types';
import type { SpeechSessionLifecycleEvent } from '../speech/speechSessionLifecycle';
import type { TextSessionStatus } from '../text/text.types';
import type { DesktopSession } from '../transport/transport.types';
import type { CreateEphemeralTokenResponse } from '@livepair/shared-types';
import type { createVoicePlaybackController } from '../voice/voicePlaybackController';
import type { createScreenCaptureController } from '../screen/screenCaptureController';
import type { createVoiceChunkPipeline } from '../voice/voiceChunkPipeline';
import type { createVoiceTokenManager } from '../voice/voiceTokenManager';
import type { createVoiceTranscriptController } from '../voice/voiceTranscriptController';
import type { createSessionControllerRuntime } from './sessionRuntime';
import { createSessionControllerErrorHandling } from './sessionErrorHandling';
import { createSessionControllerLifecycle } from './sessionLifecycle';
import { createSessionControllerModeSwitching } from './sessionModeSwitching';
import { createSessionControllerPublicApi } from './sessionPublicApi';
import { createSessionControllerTeardown } from './sessionTeardown';

type RuntimeRef = {
  current: ReturnType<typeof createSessionControllerRuntime> | null;
};

type TransportEvent = Parameters<Parameters<DesktopSession['subscribe']>[0]>[0];

type EndSessionInternalOptions = {
  preserveLastRuntimeError?: string | null;
  recordEvents?: boolean;
  preserveVoiceRuntimeDiagnostics?: boolean;
  liveSessionEnd?: {
    status: 'ended' | 'failed';
    endedReason?: string | null;
  };
};

type EndSessionInternal = (options?: EndSessionInternalOptions) => Promise<void>;

type SessionLifecycleAssemblyArgs = {
  dependencies: DesktopSessionControllerDependencies;
  conversationCtx: ConversationContext;
  runtimeRef: RuntimeRef;
  playbackCtrl: ReturnType<typeof createVoicePlaybackController>;
  screenCtrl: ReturnType<typeof createScreenCaptureController>;
  voiceChunkCtrl: ReturnType<typeof createVoiceChunkPipeline>;
  voiceTranscript: ReturnType<typeof createVoiceTranscriptController>;
  tokenMgr: ReturnType<typeof createVoiceTokenManager>;
  appendTypedUserTurn: (text: string) => string;
  handleTransportEvent: (event: TransportEvent) => void;
  requestVoiceSessionToken: (
    operationId: number,
  ) => Promise<CreateEphemeralTokenResponse | null>;
  selectedOutputDeviceId: () => string;
  setVoiceErrorState: (detail: string) => void;
  settleVoiceErrorState: (detail: string) => Promise<void>;
};

export function createSessionLifecycleAssembly({
  dependencies,
  conversationCtx,
  runtimeRef,
  playbackCtrl,
  screenCtrl,
  voiceChunkCtrl,
  voiceTranscript,
  tokenMgr,
  appendTypedUserTurn,
  handleTransportEvent,
  requestVoiceSessionToken,
  selectedOutputDeviceId,
  setVoiceErrorState,
  settleVoiceErrorState,
}: SessionLifecycleAssemblyArgs): {
  publicApi: DesktopSessionController;
  endSessionInternal: EndSessionInternal;
  voiceErrorHandlers: ReturnType<typeof createSessionControllerErrorHandling>;
} {
  const teardown = createSessionControllerTeardown({
    store: dependencies.store,
    currentSpeechLifecycleStatus: () => runtimeRef.current!.currentSpeechLifecycleStatus(),
    currentTextSessionStatus: () => runtimeRef.current!.currentTextSessionStatus(),
    applySpeechLifecycleEvent: (event) => {
      runtimeRef.current!.applySpeechLifecycleEvent(event as SpeechSessionLifecycleEvent);
    },
    clearToken: () => {
      tokenMgr.clear();
    },
    clearCurrentVoiceTranscript: () => runtimeRef.current!.clearCurrentVoiceTranscript(),
    cleanupTransport: () => runtimeRef.current!.cleanupTransport(),
    getActiveTransport: () => runtimeRef.current!.getActiveTransport(),
    getVoiceCapture: () => voiceChunkCtrl.getVoiceCapture(),
    hasActiveTextStream: () => false,
    hasScreenCapture: () => screenCtrl.isActive(),
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
    setVoiceSessionStatus: (status) => {
      dependencies.store.getState().setVoiceSessionStatus(status);
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

  let ensureExclusiveMode = async (
    _targetMode: ProductMode,
    _operationId: number,
  ): Promise<void> => {
    throw new Error('ensureExclusiveMode called before initialization');
  };

  const lifecycle = createSessionControllerLifecycle({
    store: dependencies.store,
    beginSessionOperation: () => runtimeRef.current!.beginSessionOperation(),
    isCurrentSessionOperation: (operationId) => runtimeRef.current!.isCurrentSessionOperation(operationId),
    ensureExclusiveMode: (targetMode, operationId) => ensureExclusiveMode(targetMode, operationId),
    currentVoiceSessionStatus: () => runtimeRef.current!.currentVoiceSessionStatus(),
    recordSessionEvent: (event) => runtimeRef.current!.recordSessionEvent(event),
    applySpeechLifecycleEvent: (event) => {
      runtimeRef.current!.applySpeechLifecycleEvent(event as SpeechSessionLifecycleEvent);
    },
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
    selectedOutputDeviceId,
    setVoiceSessionStatus: (status) => {
      runtimeRef.current!.setVoiceSessionStatus(status);
    },
    resetVoiceSessionResumption: () => runtimeRef.current!.resetVoiceSessionResumption(),
    resetVoiceSessionDurability: () => runtimeRef.current!.resetVoiceSessionDurability(),
    resetVoiceToolState: () => runtimeRef.current!.resetVoiceToolState(),
    requestVoiceSessionToken,
    buildRehydrationPacketFromCurrentChat,
    setCachedVoiceToken: (token) => {
      tokenMgr.set(token);
    },
    syncVoiceDurabilityState: (token, patch) => runtimeRef.current!.syncVoiceDurabilityState(token, patch),
    restorePersistedLiveSession: () => restoreCurrentLiveSession(),
    invalidatePersistedLiveSession: async (patch) => {
      await updateCurrentLiveSession({
        kind: 'resumption',
        ...patch,
      });
    },
    createPersistedLiveSession: async () => {
      await startCurrentLiveSession();
    },
    endPersistedLiveSession: async (liveSessionEnd) => {
      await endCurrentLiveSession(liveSessionEnd);
    },
    setVoiceResumptionInFlight: (value) => {
      runtimeRef.current!.setVoiceResumptionInFlight(value);
    },
    createTransport: () => dependencies.createTransport(LIVE_ADAPTER_KEY),
    activateVoiceTransport: (transport) => {
      runtimeRef.current!.cleanupTransport();
      runtimeRef.current!.setActiveTransport(transport);
      runtimeRef.current!.subscribeTransport(transport, handleTransportEvent);
    },
    startVoiceCapture: () => voiceChunkCtrl.startCapture({ shutdownOnFailure: true }),
    setVoiceErrorState: (detail) => settleVoiceErrorState(detail),
    checkBackendHealth: () => dependencies.checkBackendHealth(),
    textRuntimeFailed: () => undefined,
    logRuntimeDiagnostic,
  });

  const endSessionInternal: EndSessionInternal = async (options = {}): Promise<void> => {
    const {
      preserveLastRuntimeError = null,
      recordEvents = false,
      preserveVoiceRuntimeDiagnostics = false,
      liveSessionEnd = {
        status: 'ended' as const,
        endedReason: null,
      },
    } = options;

    runtimeRef.current!.beginSessionOperation();

    if (recordEvents) {
      runtimeRef.current!.recordSessionEvent({ type: 'session.end.requested' });
    }

    await teardownActiveRuntime({
      textSessionStatus: 'disconnected',
      preserveLastRuntimeError,
      preserveVoiceRuntimeDiagnostics,
    });
    await endCurrentLiveSession(liveSessionEnd);
    runtimeRef.current!.setCurrentMode('inactive');

    if (recordEvents) {
      runtimeRef.current!.recordSessionEvent({ type: 'session.ended' });
    }
  };

  const endSpeechModeInternal = async (
    options: { recordEvents?: boolean } = {},
  ): Promise<void> => {
    const { recordEvents = false } = options;

    runtimeRef.current!.beginSessionOperation();

    if (recordEvents) {
      runtimeRef.current!.recordSessionEvent({ type: 'session.end.requested' });
    }

    await teardownActiveRuntime({
      textSessionStatus: 'disconnected',
      preserveConversationTurns: true,
    });
    await endCurrentLiveSession({
      status: 'ended',
      endedReason: null,
    });
    runtimeRef.current!.setCurrentMode('inactive');

    if (recordEvents) {
      runtimeRef.current!.recordSessionEvent({ type: 'session.ended' });
    }
  };

  const voiceErrorHandlers = createSessionControllerErrorHandling({
    clearToken: () => {
      tokenMgr.clear();
    },
    cleanupTransport: () => runtimeRef.current!.cleanupTransport(),
    endSessionInternal: (options) => endSessionInternal(options),
    logRuntimeError,
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
    setVoiceSessionStatus: (status) => {
      dependencies.store.getState().setVoiceSessionStatus(status);
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
    isCurrentSessionOperation: (operationId) => runtimeRef.current!.isCurrentSessionOperation(operationId),
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
      performBackendHealthCheck: () => lifecycle.performBackendHealthCheck(),
      startSessionInternal: lifecycle.startSessionInternal,
      voiceChunkCtrl,
      screenCtrl,
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
        endSpeechModeInternal: (options) => endSpeechModeInternal(options),
        endSessionInternal: (options) => endSessionInternal(options),
        getActiveTransport: () => runtimeRef.current!.getActiveTransport(),
        recordSessionEvent: (event) => runtimeRef.current!.recordSessionEvent(event),
        setVoiceErrorState: (detail) => setVoiceErrorState(detail),
        syncSpeechSilenceTimeout: (status) => runtimeRef.current!.syncSpeechSilenceTimeout(status),
      },
      logRuntimeError,
    }),
    endSessionInternal,
    voiceErrorHandlers,
  };
}
