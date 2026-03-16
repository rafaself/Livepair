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
  createDefaultVisualSendDiagnostics,
  type VisualSendEvent,
} from './screenContextDiagnostics';
import type { ContinuousScreenQuality, ScreenContextMode } from '../../../shared/settings';
import { getScreenCaptureQualityParams } from './screenCapturePolicy';
import type {
  CreateScreenCapture,
  GetRealtimeOutboundGateway,
  GetTransport,
  ScreenCaptureController,
  ScreenCaptureStoreApi,
  ScreenFrameDumpControls,
  StopScreenCaptureOptions,
} from './controller/screenCaptureControllerTypes';
import type { LocalScreenFrame } from './screen.types';

export type { ScreenCaptureController } from './controller/screenCaptureControllerTypes';

export const CONTINUOUS_SCREEN_SEND_INTERVAL_MS = 3000;
export const MANUAL_SEND_DEBOUNCE_MS = 1_000;

export type ScreenCaptureControllerOptions = {
  continuousSendIntervalMs?: number;
  nowMs?: () => number;
};

export function createScreenCaptureController(
  store: ScreenCaptureStoreApi,
  createCapture: CreateScreenCapture,
  getTransport: GetTransport,
  getRealtimeOutboundGateway: GetRealtimeOutboundGateway,
  screenFrameDumpControls?: ScreenFrameDumpControls,
  controllerOptions?: ScreenCaptureControllerOptions,
  getBaselineQuality?: () => ContinuousScreenQuality,
  getScreenContextMode?: () => ScreenContextMode,
): ScreenCaptureController {
  const continuousSendIntervalMs = Math.max(
    1,
    controllerOptions?.continuousSendIntervalMs ?? CONTINUOUS_SCREEN_SEND_INTERVAL_MS,
  );
  const nowMs = controllerOptions?.nowMs ?? (() => Date.now());
  const controllerState = createScreenCaptureControllerState();

  const resolveRuntimeScreenContextMode = (): 'manual' | 'continuous' => {
    return getScreenContextMode?.() === 'continuous' ? 'continuous' : 'manual';
  };
  const isManualMode = (): boolean => resolveRuntimeScreenContextMode() === 'manual';
  const resolveRequestedCaptureQuality = (): ContinuousScreenQuality => {
    return isManualMode() ? 'high' : (getBaselineQuality?.() ?? 'medium');
  };
  const toIsoTimestamp = (timestampMs: number): string => new Date(timestampMs).toISOString();

  let latestCapturedFrame: LocalScreenFrame | null = null;
  let continuousTimer: ReturnType<typeof setInterval> | null = null;
  let resetFrameSendChain: () => void = () => {};
  let stopInternal: (options?: StopScreenCaptureOptions) => Promise<void> = async () => {
    throw new Error('stopInternal called before initialization');
  };

  let diagnostics = createDefaultVisualSendDiagnostics(continuousSendIntervalMs);
  let manualSendPending = false;
  let lastManualSendRequestedAt = Number.NEGATIVE_INFINITY;

  const setLastEvent = (lastEvent: VisualSendEvent): void => {
    diagnostics = {
      ...diagnostics,
      lastEvent,
    };
  };

  const flushVisualDiagnostics = (): void => {
    store.getState().setVisualSendDiagnostics(diagnostics);
  };

  const resetDiagnostics = (): void => {
    store.getState().setScreenCaptureDiagnostics(createEmptyScreenCaptureDiagnostics());
  };

  const applyCaptureQuality = (): void => {
    const activeCapture = controllerState.getActiveCapture();

    if (!activeCapture) {
      return;
    }

    activeCapture.capture.updateQuality(
      getScreenCaptureQualityParams(resolveRequestedCaptureQuality()),
    );
  };

  const stopContinuousSending = (
    reason: VisualSendEvent = 'continuousStopped',
    options: { dropPendingFrame?: boolean } = {},
  ): void => {
    if (continuousTimer !== null) {
      clearInterval(continuousTimer);
      continuousTimer = null;
    }

    if (options.dropPendingFrame) {
      resetFrameSendChain();
    }

    if (!diagnostics.continuousActive) {
      return;
    }

    diagnostics = {
      ...diagnostics,
      continuousActive: false,
      continuousStoppedAt: toIsoTimestamp(nowMs()),
    };
    setLastEvent(reason);

    flushVisualDiagnostics();
  };

  const startContinuousSending = (): void => {
    if (continuousTimer !== null || !controllerState.isActive() || isManualMode()) {
      return;
    }

    manualSendPending = false;
    diagnostics = {
      ...diagnostics,
      manualSendPending: false,
      continuousActive: true,
      continuousStartedAt: toIsoTimestamp(nowMs()),
    };
    setLastEvent('continuousStarted');
    applyCaptureQuality();
    flushVisualDiagnostics();

    continuousTimer = setInterval(() => {
      if (!controllerState.isActive()) {
        return;
      }

      if (isManualMode()) {
        stopContinuousSending('continuousStopped', { dropPendingFrame: true });
        return;
      }

      applyCaptureQuality();

      if (latestCapturedFrame) {
        void frameSendCoordinator.enqueueFrameSend(latestCapturedFrame);
      }
    }, continuousSendIntervalMs);
  };

  const canArmManualSend = (): boolean => {
    return (
      !manualSendPending
      && nowMs() - lastManualSendRequestedAt >= MANUAL_SEND_DEBOUNCE_MS
    );
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
    onFrameAccepted: () => {
      flushVisualDiagnostics();
    },
    onFrameBlockedByGateway: () => {
      if (manualSendPending) {
        manualSendPending = false;
        diagnostics = {
          ...diagnostics,
          manualSendPending: false,
          blockedByGateway: diagnostics.blockedByGateway + 1,
        };
        setLastEvent('manualSendBlocked');
        flushVisualDiagnostics();
        return;
      }

      diagnostics = {
        ...diagnostics,
        blockedByGateway: diagnostics.blockedByGateway + 1,
      };
    },
    flushVisualDiagnostics,
    onSendStarted: () => {
      store.getState().setScreenCaptureDiagnostics({
        lastUploadStatus: 'sending',
        lastError: null,
      });
    },
    onSendSucceeded: (frame) => {
      const activeCapture = controllerState.getActiveCapture();

      if (activeCapture) {
        frameDumpCoordinator.persistFrame(activeCapture.capture, activeCapture.generation, frame);
      }

      if (manualSendPending) {
        manualSendPending = false;
        diagnostics = {
          ...diagnostics,
          manualSendPending: false,
          manualFramesSentCount: diagnostics.manualFramesSentCount + 1,
          lastManualFrameAt: toIsoTimestamp(nowMs()),
        };
        setLastEvent('manualFrameSent');
        store.getState().setScreenCaptureState('capturing');
      } else {
        diagnostics = {
          ...diagnostics,
          continuousFramesSentCount: diagnostics.continuousFramesSentCount + 1,
          lastContinuousFrameAt: toIsoTimestamp(nowMs()),
        };
        setLastEvent('continuousFrameSent');
        store.getState().setScreenCaptureState('capturing');
      }

      store.getState().setScreenCaptureDiagnostics({
        lastUploadStatus: 'sent',
        lastError: null,
      });
      flushVisualDiagnostics();
    },
    onSendFailed: (detail) => {
      manualSendPending = false;
      diagnostics = {
        ...diagnostics,
        manualSendPending: false,
      };
      store.getState().setLastRuntimeError(detail);
      stopContinuousSending('continuousStopped', { dropPendingFrame: true });
      void stopInternal({
        nextState: 'error',
        detail,
        preserveDiagnostics: true,
        uploadStatus: 'error',
      });
    },
  });

  resetFrameSendChain = frameSendCoordinator.reset;

  const handleFrameCaptured = (frame: LocalScreenFrame): void => {
    latestCapturedFrame = frame;
    applyCaptureQuality();

    if (isManualMode()) {
      stopContinuousSending('continuousStopped', { dropPendingFrame: true });
      if (manualSendPending) {
        void frameSendCoordinator.enqueueFrameSend(frame);
      }
      return;
    }

    startContinuousSending();
  };

  const lifecycle = createScreenCaptureLifecycle({
    store,
    controllerState,
    createCapture,
    getTransport,
    resetDiagnostics,
    frameDumpCoordinator,
    frameSendCoordinator,
    onFrameCaptured: handleFrameCaptured,
    getCaptureStartParams: () => getScreenCaptureQualityParams(resolveRequestedCaptureQuality()),
    onScreenShareStarted: () => {
      latestCapturedFrame = null;
      diagnostics = {
        ...diagnostics,
        manualSendPending: false,
      };
      setLastEvent('screenShareStarted');
      flushVisualDiagnostics();

      if (!isManualMode()) {
        startContinuousSending();
      }
    },
    onScreenShareStopped: () => {
      latestCapturedFrame = null;
      manualSendPending = false;
      lastManualSendRequestedAt = Number.NEGATIVE_INFINITY;
      stopContinuousSending('continuousStopped', { dropPendingFrame: true });
      diagnostics = {
        ...diagnostics,
        manualSendPending: false,
      };
      setLastEvent('screenShareStopped');
      flushVisualDiagnostics();
    },
  });

  stopInternal = lifecycle.stopInternal;

  return {
    start: () => {
      applyCaptureQuality();
      return lifecycle.start();
    },
    stop: lifecycle.stop,
    stopInternal: lifecycle.stopInternal,
    resetDiagnostics,
    enqueueFrameSend: frameSendCoordinator.enqueueFrameSend,
    isActive: lifecycle.isActive,
    resetSendChain: frameSendCoordinator.reset,
    analyzeScreenNow: () => {
      if (!lifecycle.isActive() || !isManualMode() || !canArmManualSend()) {
        return;
      }

      stopContinuousSending('continuousStopped', { dropPendingFrame: true });
      applyCaptureQuality();
      manualSendPending = true;
      lastManualSendRequestedAt = nowMs();
      diagnostics = {
        ...diagnostics,
        manualSendPending: true,
      };
      setLastEvent('manualSendRequested');
      flushVisualDiagnostics();
    },
  };
}
