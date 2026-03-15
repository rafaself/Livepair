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
import {
  createVisualChangeDetector,
} from './visualChangeDetector';
import type { VisualChangeDetectorOptions } from './visualChangeDetector';
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

/** Default burst duration in milliseconds. */
export const VISUAL_BURST_DURATION_MS = 5000;

/** Consecutive non-change frames required to end a burst early (stabilization). */
export const VISUAL_BURST_STABLE_FRAMES = 2;

export type ScreenCaptureControllerOptions = {
  visualSendPolicyOptions?: VisualSendPolicyOptions;
  visualChangeDetectorOptions?: VisualChangeDetectorOptions;
  burstDurationMs?: number;
  burstStableFrames?: number;
};

export function createScreenCaptureController(
  store: ScreenCaptureStoreApi,
  createCapture: CreateScreenCapture,
  getTransport: GetTransport,
  getRealtimeOutboundGateway: GetRealtimeOutboundGateway,
  screenFrameDumpControls?: ScreenFrameDumpControls,
  controllerOptions?: ScreenCaptureControllerOptions,
): ScreenCaptureController {
  const visualPolicy = createVisualSendPolicy(controllerOptions?.visualSendPolicyOptions);
  const controllerState = createScreenCaptureControllerState();
  const visualChangeDetector = createVisualChangeDetector(
    controllerOptions?.visualChangeDetectorOptions,
  );

  const burstDurationMs = controllerOptions?.burstDurationMs ?? VISUAL_BURST_DURATION_MS;
  const burstStableFrames = controllerOptions?.burstStableFrames ?? VISUAL_BURST_STABLE_FRAMES;

  // Burst state – managed by the controller, not the policy
  let burstTimer: ReturnType<typeof setTimeout> | null = null;
  let isBurstActive = false;
  let burstStableFrameCount = 0;

  const flushVisualDiagnostics = (): void => {
    store.getState().setVisualSendDiagnostics(visualPolicy.getDiagnostics());
  };

  const resetDiagnostics = (): void => {
    store.getState().setScreenCaptureDiagnostics(createEmptyScreenCaptureDiagnostics());
  };

  let stopInternal: (options?: StopScreenCaptureOptions) => Promise<void> = async () => {
    throw new Error('stopInternal called before initialization');
  };

  // ── Burst timer management ───────────────────────────────────────────────

  const clearBurstTimer = (): void => {
    if (burstTimer !== null) {
      clearTimeout(burstTimer);
      burstTimer = null;
    }
  };

  const endBurst = (): void => {
    if (!isBurstActive) return;
    isBurstActive = false;
    burstStableFrameCount = 0;
    clearBurstTimer();
    visualPolicy.endBurst();
    flushVisualDiagnostics();
  };

  const resetBurstTimer = (): void => {
    clearBurstTimer();
    burstTimer = setTimeout(() => {
      burstTimer = null;
      endBurst();
    }, burstDurationMs);
  };

  const startBurst = (): void => {
    isBurstActive = true;
    burstStableFrameCount = 0;
    visualPolicy.startBurst();
    flushVisualDiagnostics();
    resetBurstTimer();
  };

  // ── Visual change detection (called for every captured frame) ────────────

  const handleFrameCaptured = (frame: { data: Uint8Array }): void => {
    const changed = visualChangeDetector.onFrame(frame);

    if (changed) {
      burstStableFrameCount = 0;

      if (visualPolicy.getState() === 'sleep') {
        startBurst();
      } else if (isBurstActive) {
        // Extend burst on continued visual change
        resetBurstTimer();
      }
    } else if (isBurstActive && visualPolicy.getState() === 'streaming') {
      burstStableFrameCount += 1;
      if (burstStableFrameCount >= burstStableFrames) {
        endBurst();
      }
    }
  };

  // ── Frame pipeline coordinators ──────────────────────────────────────────

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

  // ── Lifecycle ────────────────────────────────────────────────────────────

  const lifecycle = createScreenCaptureLifecycle({
    store,
    controllerState,
    createCapture,
    getTransport,
    resetDiagnostics,
    frameDumpCoordinator,
    frameSendCoordinator,
    onFrameCaptured: handleFrameCaptured,
    onScreenShareStarted: () => {
      visualPolicy.onScreenShareStarted();
      // Bootstrap: send exactly one initial frame so the model has visual
      // context, then return to sleep.  Continuous streaming is NOT enabled
      // by default — the visual send policy remains the authority over
      // subsequent frame delivery.
      visualPolicy.armBootstrapSnapshot();
      flushVisualDiagnostics();
    },
    onScreenShareStopped: () => {
      clearBurstTimer();
      isBurstActive = false;
      burstStableFrameCount = 0;
      visualChangeDetector.reset();
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
      // Explicit user action: clear any active burst
      if (isBurstActive) {
        clearBurstTimer();
        isBurstActive = false;
        burstStableFrameCount = 0;
      }
      visualPolicy.analyzeScreenNow();
      flushVisualDiagnostics();
    },
    enableStreaming: () => {
      // Explicit streaming overrides burst
      clearBurstTimer();
      isBurstActive = false;
      burstStableFrameCount = 0;
      visualPolicy.enableStreaming();
      flushVisualDiagnostics();
    },
    stopStreaming: () => {
      clearBurstTimer();
      isBurstActive = false;
      burstStableFrameCount = 0;
      visualPolicy.stopStreaming();
      flushVisualDiagnostics();
    },
    onSpeechStart: () => {
      if (!lifecycle.isActive()) return;
      visualPolicy.triggerSnapshot('speechTrigger');
      flushVisualDiagnostics();
    },
    onTextSent: () => {
      if (!lifecycle.isActive()) return;
      visualPolicy.triggerSnapshot('textTrigger');
      flushVisualDiagnostics();
    },
  };
}
