import {
  logRuntimeDiagnostic,
  logLifecycleTransition,
  logRuntimeError,
} from '../core/logger';
import { isRuntimeDebugModeEnabled } from '../core/debugMode';
import { createVoicePlaybackController } from '../voice/media/voicePlaybackController';
import { createScreenCaptureController } from '../screen/screenCaptureController';
import { createVoiceToolController } from '../voice/tools/voiceToolController';
import { createVoiceInterruptionController } from '../voice/session/voiceInterruptionController';
import { createVoiceTokenManager } from '../voice/session/voiceTokenManager';
import { createSpeechSilenceController } from '../speech/speechSilenceController';
import { createVoiceChunkPipeline } from '../voice/media/voiceChunkPipeline';
import { createSessionControllerStateSync } from './sessionStateSync';
import { createSessionControllerMutableRuntime } from './sessionMutableRuntime';
import { createSessionControllerRuntime } from './sessionRuntime';
import { createSessionConversationSupport } from './sessionConversationSupport';
import { createLiveTelemetryCollector } from './liveTelemetryCollector';
import { createLiveRuntimeSupervisor } from './liveRuntimeSupervisor';
import { useUiStore } from '../../store/uiStore';
import { setAssistantAnswerMetadata } from '../conversation/conversationTurnManager';
import desktopPackageJson from '../../../../package.json';
import type {
  DesktopSessionController,
  DesktopSessionControllerDependencies,
} from '../core/sessionControllerTypes';

export function createSessionControllerAssembly(
  dependencies: DesktopSessionControllerDependencies,
): DesktopSessionController {
  const telemetryPlatform = (() => {
    if (typeof navigator === 'undefined') {
      return 'unknown';
    }

    const navigatorWithUserAgentData = navigator as Navigator & {
      userAgentData?: { platform?: string | undefined } | undefined;
    };

    if (typeof navigatorWithUserAgentData.userAgentData?.platform === 'string') {
      return navigatorWithUserAgentData.userAgentData.platform;
    }

    return navigator.platform || 'unknown';
  })();
  const telemetryCollector = createLiveTelemetryCollector({
    emit: (events) => dependencies.reportLiveTelemetry(events),
  });
  const mutableRuntime = createSessionControllerMutableRuntime({
    onRealtimeOutboundDiagnosticsChanged: (diagnostics) => {
      dependencies.store.getState().setRealtimeOutboundDiagnostics(diagnostics);
    },
    shouldPublishRealtimeOutboundDiagnostics: isRuntimeDebugModeEnabled,
  });
  const {
    appendTypedUserTurn,
    clearPendingAssistantTurn,
    conversationCtx,
    persistSettledConversationTurn,
    voiceTranscript,
  } = createSessionConversationSupport(dependencies.store);
  let endSessionInternal = async (
    _options: {
      preserveLastRuntimeError?: string | null;
      recordEvents?: boolean;
      preserveVoiceRuntimeDiagnostics?: boolean;
      liveSessionEnd?: {
        status: 'ended' | 'failed';
        endedReason?: string | null;
      };
    } = {},
  ): Promise<void> => {
    throw new Error('endSessionInternal called before initialization');
  };
  const runtimeRef = {
    current: null as ReturnType<typeof createSessionControllerRuntime> | null,
  };
  const playbackCtrl = createVoicePlaybackController(
    dependencies.store,
    dependencies.settingsStore,
    dependencies.createVoicePlayback,
  );
  const screenCtrl = createScreenCaptureController(
    dependencies.store,
    dependencies.createScreenCapture,
    () => mutableRuntime.getActiveTransport(),
    () => mutableRuntime.getRealtimeOutboundGateway(),
    {
      shouldSaveFrames: () => useUiStore.getState().saveScreenFramesEnabled,
      startScreenFrameDumpSession: () => window.bridge.startScreenFrameDumpSession(),
      saveScreenFrameDumpFrame: (request) => window.bridge.saveScreenFrameDumpFrame(request),
      setScreenFrameDumpDirectoryPath: (directoryPath) => {
        useUiStore.getState().setScreenFrameDumpDirectoryPath(directoryPath);
      },
    },
    undefined,
    () => dependencies.settingsStore.getState().settings.continuousScreenQuality,
    () => dependencies.settingsStore.getState().settings.screenContextMode,
  );
  const refreshScreenCaptureSourceSnapshot = async (): Promise<boolean> => {
    try {
      const snapshot = await window.bridge.listScreenCaptureSources();
      dependencies.store.getState().setScreenCaptureSourceSnapshot(snapshot);
      return true;
    } catch (error: unknown) {
      dependencies.store.getState().setLastRuntimeError(
        error instanceof Error && error.message.length > 0
          ? error.message
          : 'Failed to refresh screen capture sources',
      );
      return false;
    }
  };
  let setVoiceErrorState = (_detail: string): void => {
    throw new Error('setVoiceErrorState called before initialization');
  };
  let settleVoiceErrorState = async (_detail: string): Promise<void> => {
    throw new Error('settleVoiceErrorState called before initialization');
  };
  const voiceToolCtrl = createVoiceToolController(
    dependencies.store,
    () => mutableRuntime.getActiveTransport(),
    () => stateSync.createVoiceToolExecutionSnapshot(),
    () => ({
      groundingEnabled:
        dependencies.store.getState().activeVoiceSessionGroundingEnabled
        ?? dependencies.settingsStore.getState().settings.groundingEnabled,
    }),
    (answerMetadata) => {
      setAssistantAnswerMetadata(conversationCtx, answerMetadata);
      logRuntimeDiagnostic('voice-session', 'assistant answer provenance updated', {
        provenance: answerMetadata.provenance,
        ...(answerMetadata.confidence ? { confidence: answerMetadata.confidence } : {}),
        ...(answerMetadata.reason ? { reason: answerMetadata.reason } : {}),
      });
    },
  );
  const interruptionCtrl = createVoiceInterruptionController(
    dependencies.store,
    () => mutableRuntime.getActiveTransport(),
    () => runtimeRef.current!.currentVoiceSessionStatus(),
    (event) => runtimeRef.current!.applySessionEvent(event),
    () => runtimeRef.current!.stopVoicePlayback(),
  );
  const tokenMgr = createVoiceTokenManager(
    dependencies.store,
    dependencies.requestSessionToken,
    (id) => runtimeRef.current!.isCurrentSessionOperation(id),
    (patch) => runtimeRef.current!.setVoiceSessionDurability(patch),
    (event) => runtimeRef.current!.recordSessionEvent(event),
    (detail) => setVoiceErrorState(detail),
    dependencies.transportAdapter.key,
  );
  const silenceCtrl = createSpeechSilenceController(
    dependencies.settingsStore,
    () => void endSessionInternal(),
    () => runtimeRef.current!.applySessionEvent({ type: 'turn.recovery.completed' }),
  );
  const voiceChunkCtrl = createVoiceChunkPipeline({
    store: dependencies.store,
    settingsStore: dependencies.settingsStore,
    createVoiceCapture: dependencies.createVoiceCapture,
    getActiveTransport: () => mutableRuntime.getActiveTransport(),
    getRealtimeOutboundGateway: () => mutableRuntime.getRealtimeOutboundGateway(),
    currentVoiceSessionStatus: () => runtimeRef.current!.currentVoiceSessionStatus(),
    setVoiceSessionStatus: (s) => runtimeRef.current!.setVoiceSessionStatus(s),
    setVoiceErrorState: (d) => setVoiceErrorState(d),
    logRuntimeError,
  });
  const stateSync = createSessionControllerStateSync({
    store: dependencies.store,
    settingsStore: dependencies.settingsStore,
    onSpeechLifecycleTransition: (previousStatus, nextStatus, eventType) => {
      logLifecycleTransition(previousStatus, nextStatus, eventType);
    },
    handleSpeechLifecycleStatusChange: (status) => {
      silenceCtrl.handleStatusChange(status);
    },
    updateVoicePlaybackDiagnostics: (patch) => {
      playbackCtrl.updateDiagnostics(patch);
    },
    setVoicePlaybackState: (state) => {
      playbackCtrl.setState(state);
    },
    getVoicePlayback: () => playbackCtrl.getOrCreate(),
    setVoiceToolState: (patch) => {
      voiceToolCtrl.setState(patch);
    },
    resetVoiceToolState: () => {
      voiceToolCtrl.reset();
    },
    clearCurrentVoiceTranscript: () => {
      voiceTranscript.clearTranscript();
    },
    resetVoiceTurnTranscriptState: () => {
      voiceTranscript.resetTurnTranscriptState();
    },
    applyVoiceTranscriptUpdate: (role, text, isFinal) => {
      voiceTranscript.applyTranscriptUpdate(role, text, isFinal);
    },
    syncVoiceDurabilityState: (token, patch) => {
      tokenMgr.syncDurabilityState(token, patch);
    },
  });
  runtimeRef.current = createSessionControllerRuntime({
    logger: dependencies.logger,
    store: dependencies.store,
    mutableRuntime,
    stateSync,
    playbackCtrl,
    voiceChunkCtrl,
    voiceToolCtrl,
    screenCtrl,
    interruptionCtrl,
    currentTextSessionStatus: () => dependencies.store.getState().textSessionLifecycle.status,
    resetTextSessionRuntime: (textSessionStatus, options) => {
      dependencies.store.getState().resetTextSessionRuntime(textSessionStatus, options);
    },
    clearPendingAssistantTurn: () => {
      clearPendingAssistantTurn();
    },
    voiceTranscript,
    silenceCtrl,
  });
  const {
    publicApi,
    endSessionInternal: assembledEndSessionInternal,
    voiceErrorHandlers,
  } = createLiveRuntimeSupervisor({
    dependencies,
    conversationCtx,
    mutableRuntime,
    runtimeRef,
    telemetryCollector,
    telemetryEnvironment: import.meta.env.MODE,
    telemetryPlatform,
    telemetryAppVersion: desktopPackageJson.version,
    playbackCtrl,
    screenCtrl,
    voiceChunkCtrl,
    voiceToolCtrl,
    voiceTranscript,
    interruptionCtrl,
    tokenMgr,
    appendTypedUserTurn,
    selectedOutputDeviceId: () => stateSync.selectedOutputDeviceId(),
    refreshScreenCaptureSourceSnapshot,
    setVoiceErrorState: (detail) => setVoiceErrorState(detail),
    settleVoiceErrorState: (detail) => settleVoiceErrorState(detail),
    persistSettledConversationTurn,
  });

  endSessionInternal = assembledEndSessionInternal;
  ({ setVoiceErrorState, settleVoiceErrorState } = voiceErrorHandlers);

  return publicApi;
}
