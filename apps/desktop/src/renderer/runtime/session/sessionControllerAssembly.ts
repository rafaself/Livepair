import {
  logLifecycleTransition,
  logRuntimeError,
} from '../core/logger';
import { LIVE_ADAPTER_KEY } from '../transport/liveConfig';
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
import { createSessionTransportAssembly } from './sessionTransportAssembly';
import { createSessionLifecycleAssembly } from './sessionLifecycleAssembly';
import { createSessionConversationSupport } from './sessionConversationSupport';
import { useUiStore } from '../../store/uiStore';
import type {
  DesktopSessionController,
  DesktopSessionControllerDependencies,
} from '../core/sessionControllerTypes';

export function createSessionControllerAssembly(
  dependencies: DesktopSessionControllerDependencies,
): DesktopSessionController {
  const mutableRuntime = createSessionControllerMutableRuntime({
    onRealtimeOutboundDiagnosticsChanged: (diagnostics) => {
      dependencies.store.getState().setRealtimeOutboundDiagnostics(diagnostics);
    },
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
  );
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
  );
  const interruptionCtrl = createVoiceInterruptionController(
    dependencies.store,
    () => mutableRuntime.getActiveTransport(),
    () => runtimeRef.current!.currentVoiceSessionStatus(),
    (status) => runtimeRef.current!.setVoiceSessionStatus(status),
    (event) => runtimeRef.current!.applySpeechLifecycleEvent(event),
    () => runtimeRef.current!.stopVoicePlayback(),
  );
  const tokenMgr = createVoiceTokenManager(
    dependencies.store,
    dependencies.requestSessionToken,
    (id) => runtimeRef.current!.isCurrentSessionOperation(id),
    (patch) => runtimeRef.current!.setVoiceSessionDurability(patch),
    (event) => runtimeRef.current!.recordSessionEvent(event),
    (detail) => setVoiceErrorState(detail),
    LIVE_ADAPTER_KEY,
  );
  const silenceCtrl = createSpeechSilenceController(
    dependencies.settingsStore,
    () => void endSessionInternal(),
    () => runtimeRef.current!.applySpeechLifecycleEvent({ type: 'recovery.completed' }),
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
    endSessionInternal: (o) => void endSessionInternal(o),
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
  const { handleTransportEvent, requestVoiceSessionToken } = createSessionTransportAssembly({
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
    setVoiceErrorState: (detail) => setVoiceErrorState(detail),
    persistSettledConversationTurn,
  });
  const {
    publicApi,
    endSessionInternal: assembledEndSessionInternal,
    voiceErrorHandlers,
  } = createSessionLifecycleAssembly({
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
    selectedOutputDeviceId: () => stateSync.selectedOutputDeviceId(),
    setVoiceErrorState: (detail) => setVoiceErrorState(detail),
    settleVoiceErrorState: (detail) => settleVoiceErrorState(detail),
  });

  endSessionInternal = assembledEndSessionInternal;
  ({ setVoiceErrorState, settleVoiceErrorState } = voiceErrorHandlers);

  return publicApi;
}
