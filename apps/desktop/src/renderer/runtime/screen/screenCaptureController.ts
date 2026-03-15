import {
  createVisualSendPolicy,
} from './visualSendPolicy';
import type { VisualSendPolicyOptions } from './visualSendPolicy';
import {
  createScreenCaptureLifecycle,
} from './controller/screenCaptureLifecycle';
import {
  createEmptyScreenCaptureDiagnostics,
  createScreenCaptureControllerState,
} from './controller/screenCaptureControllerState';
import {
  createScreenFrameDumpCoordinator,
} from './controller/screenFrameDumpCoordinator';
import {
  createScreenFrameSendCoordinator,
} from './controller/screenFrameSendCoordinator';
import type {
  CreateScreenCapture,
  GetRealtimeOutboundGateway,
  GetTransport,
  ScreenCaptureController,
  ScreenCaptureStoreApi,
  ScreenFrameDumpControls,
  StopScreenCaptureOptions,
} from './controller/screenCaptureControllerTypes';

export type { ScreenCaptureController } from './controller/screenCaptureControllerTypes';

export function createScreenCaptureController(
  store: ScreenCaptureStoreApi,
  createCapture: CreateScreenCapture,
  getTransport: GetTransport,
  getRealtimeOutboundGateway: GetRealtimeOutboundGateway,
  screenFrameDumpControls?: ScreenFrameDumpControls,
  visualSendPolicyOptions?: VisualSendPolicyOptions,
): ScreenCaptureController {
  const visualPolicy = createVisualSendPolicy(visualSendPolicyOptions);
  const controllerState = createScreenCaptureControllerState();

  const flushVisualDiagnostics = (): void => {
    store.getState().setVisualSendDiagnostics(visualPolicy.getDiagnostics());
  };

  const resetDiagnostics = (): void => {
    store.getState().setScreenCaptureDiagnostics(createEmptyScreenCaptureDiagnostics());
  };

  let stopInternal: (options?: StopScreenCaptureOptions) => Promise<void> = async () => {
    throw new Error('stopInternal called before initialization');
  };

  const frameDumpCoordinator = createScreenFrameDumpCoordinator({
    screenFrameDumpControls,
    isCurrentCapture: controllerState.isCurrentCapture,
    onError: (detail) => {
      store.getState().setLastRuntimeError(detail);
    },
  });

  const frameSendCoordinator = createScreenFrameSendCoordinator({
    getActiveCapture: controllerState.getActiveCapture,
    isCurrentCapture: controllerState.isCurrentCapture,
    getTransport,
    getRealtimeOutboundGateway,
    allowSend: () => visualPolicy.allowSend(),
    onFrameDispatched: () => {
      visualPolicy.onFrameDispatched();
      flushVisualDiagnostics();
    },
    onFrameDroppedByPolicy: () => {
      visualPolicy.onFrameDroppedByPolicy();
    },
    onFrameBlockedByGateway: () => {
      visualPolicy.onFrameBlockedByGateway();
    },
    flushVisualDiagnostics,
    onSendStarted: () => {
      store.getState().setScreenCaptureDiagnostics({
        lastUploadStatus: 'sending',
        lastError: null,
      });
    },
    onSendSucceeded: () => {
      store.getState().setScreenCaptureState('streaming');
      store.getState().setScreenCaptureDiagnostics({
        lastUploadStatus: 'sent',
        lastError: null,
      });
    },
    onSendFailed: (detail) => {
      store.getState().setLastRuntimeError(detail);
      void stopInternal({
        nextState: 'error',
        detail,
        preserveDiagnostics: true,
        uploadStatus: 'error',
      });
    },
  });

  const lifecycle = createScreenCaptureLifecycle({
    store,
    controllerState,
    createCapture,
    getTransport,
    resetDiagnostics,
    frameDumpCoordinator,
    frameSendCoordinator,
    onScreenShareStarted: () => {
      visualPolicy.onScreenShareStarted();
      // Bootstrap: send exactly one initial frame so the model has visual
      // context, then return to sleep.  Continuous streaming is NOT enabled
      // by default — the visual send policy remains the authority over
      // subsequent frame delivery.  Callers who need continuous delivery
      // must explicitly call enableStreaming() after startScreenCapture().
      visualPolicy.analyzeScreenNow();
      flushVisualDiagnostics();
    },
    onScreenShareStopped: () => {
      visualPolicy.onScreenShareStopped();
      flushVisualDiagnostics();
    },
  });
  stopInternal = lifecycle.stopInternal;

  return {
    start: lifecycle.start,
    stop: lifecycle.stop,
    stopInternal: lifecycle.stopInternal,
    resetDiagnostics,
    enqueueFrameSend: frameSendCoordinator.enqueueFrameSend,
    isActive: lifecycle.isActive,
    resetSendChain: frameSendCoordinator.reset,
    getVisualSendState: () => visualPolicy.getState(),
    analyzeScreenNow: () => {
      visualPolicy.analyzeScreenNow();
      flushVisualDiagnostics();
    },
    enableStreaming: () => {
      visualPolicy.enableStreaming();
      flushVisualDiagnostics();
    },
    stopStreaming: () => {
      visualPolicy.stopStreaming();
      flushVisualDiagnostics();
    },
  };
}
