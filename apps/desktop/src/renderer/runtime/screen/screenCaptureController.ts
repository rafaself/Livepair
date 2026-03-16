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
  ScreenFrameDumpMetadata,
  ScreenFrameDumpControls,
  StopScreenCaptureOptions,
} from './controller/screenCaptureControllerTypes';
import type { LocalScreenFrame } from './screen.types';
import { createScreenBurstDetector } from './screenBurstDetector';

export type { ScreenCaptureController } from './controller/screenCaptureControllerTypes';

export const CONTINUOUS_SCREEN_SEND_INTERVAL_MS = 3000;
export const BURST_SCREEN_SEND_INTERVAL_MS = 1_000;
export const BURST_SCREEN_SEND_WINDOW_MS = 1_000;
export const MANUAL_SEND_DEBOUNCE_MS = 1_000;

type ContinuousFrameReason = 'base' | 'burst';

export type ScreenCaptureControllerOptions = {
  continuousSendIntervalMs?: number;
  burstSendIntervalMs?: number;
  burstWindowMs?: number;
  nowMs?: () => number;
};

function cloneFrameForSend(frame: LocalScreenFrame): LocalScreenFrame {
  return {
    ...frame,
    analysis: {
      ...frame.analysis,
      tileLuminance: [...frame.analysis.tileLuminance],
      tileEdge: [...frame.analysis.tileEdge],
    },
  };
}

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
  const burstSendIntervalMs = Math.max(
    1,
    controllerOptions?.burstSendIntervalMs ?? BURST_SCREEN_SEND_INTERVAL_MS,
  );
  const burstWindowMs = Math.max(
    burstSendIntervalMs,
    controllerOptions?.burstWindowMs ?? BURST_SCREEN_SEND_WINDOW_MS,
  );
  const nowMs = controllerOptions?.nowMs ?? (() => Date.now());
  const controllerState = createScreenCaptureControllerState();
  const burstDetector = createScreenBurstDetector();

  const resolveRuntimeScreenContextMode = (): 'manual' | 'continuous' => {
    return getScreenContextMode?.() === 'continuous' ? 'continuous' : 'manual';
  };
  const isManualMode = (): boolean => resolveRuntimeScreenContextMode() === 'manual';
  const resolveRequestedCaptureQuality = (): ContinuousScreenQuality => {
    return isManualMode() ? 'high' : (getBaselineQuality?.() ?? 'medium');
  };
  const toIsoTimestamp = (timestampMs: number): string => new Date(timestampMs).toISOString();

  let latestCapturedFrame: LocalScreenFrame | null = null;
  let autoSendTimer: ReturnType<typeof setTimeout> | null = null;
  let nextBaselineSendAtMs = Number.POSITIVE_INFINITY;
  let nextBurstSendAtMs: number | null = null;
  let burstUntilMs: number | null = null;
  let resetFrameSendChain: () => void = () => {};
  let stopInternal: (options?: StopScreenCaptureOptions) => Promise<void> = async () => {
    throw new Error('stopInternal called before initialization');
  };

  let diagnostics = createDefaultVisualSendDiagnostics(
    continuousSendIntervalMs,
    burstSendIntervalMs,
  );
  let manualSendPending = false;
  let lastManualSendRequestedAt = Number.NEGATIVE_INFINITY;
  const continuousFrameReasons = new WeakMap<LocalScreenFrame, ContinuousFrameReason>();
  const frameDumpMetadata = new WeakMap<LocalScreenFrame, ScreenFrameDumpMetadata>();

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

  const syncBurstDiagnostics = (): boolean => {
    const active = burstUntilMs !== null && nowMs() <= burstUntilMs;
    const burstUntil = active && burstUntilMs !== null ? toIsoTimestamp(burstUntilMs) : null;

    if (
      diagnostics.burstActive === active
      && diagnostics.burstUntil === burstUntil
    ) {
      return false;
    }

    diagnostics = {
      ...diagnostics,
      burstActive: active,
      burstUntil,
    };

    return true;
  };

  const clearAutoSendTimer = (): void => {
    if (autoSendTimer !== null) {
      clearTimeout(autoSendTimer);
      autoSendTimer = null;
    }
  };

  const resetAutoScheduling = (): void => {
    clearAutoSendTimer();
    nextBaselineSendAtMs = Number.POSITIVE_INFINITY;
    nextBurstSendAtMs = null;
    burstUntilMs = null;
    burstDetector.reset();
    syncBurstDiagnostics();
  };

  const normalizeBurstWindow = (): boolean => {
    if (burstUntilMs !== null && nowMs() > burstUntilMs) {
      burstUntilMs = null;
      nextBurstSendAtMs = null;
      return syncBurstDiagnostics();
    }

    return false;
  };

  const scheduleNextAutoSend = (): void => {
    clearAutoSendTimer();

    if (!controllerState.isActive() || isManualMode()) {
      return;
    }

    normalizeBurstWindow();

    if (!Number.isFinite(nextBaselineSendAtMs)) {
      nextBaselineSendAtMs = nowMs() + continuousSendIntervalMs;
    }

    const candidateTimes = [nextBaselineSendAtMs];
    if (burstUntilMs !== null && nextBurstSendAtMs !== null && nextBurstSendAtMs <= burstUntilMs) {
      candidateTimes.push(nextBurstSendAtMs);
    }

    const dueAtMs = Math.min(...candidateTimes);
    autoSendTimer = setTimeout(() => {
      void runAutoSendSchedule();
    }, Math.max(0, dueAtMs - nowMs()));
  };

  const buildFrameDumpMetadata = (
    frame: LocalScreenFrame,
    metadata: ScreenFrameDumpMetadata,
  ): LocalScreenFrame => {
    frameDumpMetadata.set(frame, metadata);
    return frame;
  };

  const queueAutoFrameSend = async (reason: ContinuousFrameReason): Promise<void> => {
    if (!latestCapturedFrame) {
      return;
    }

    const frame = cloneFrameForSend(latestCapturedFrame);
    continuousFrameReasons.set(frame, reason);
    buildFrameDumpMetadata(frame, {
      savedAt: toIsoTimestamp(nowMs()),
      mode: 'continuous',
      quality: resolveRequestedCaptureQuality(),
      reason,
    });
    await frameSendCoordinator.enqueueFrameSend(frame);
  };

  const advanceBaselineSchedule = (timestampMs: number): void => {
    while (nextBaselineSendAtMs <= timestampMs) {
      nextBaselineSendAtMs += continuousSendIntervalMs;
    }
  };

  const advanceBurstSchedule = (timestampMs: number): void => {
    if (nextBurstSendAtMs === null) {
      return;
    }

    while (nextBurstSendAtMs <= timestampMs) {
      nextBurstSendAtMs += burstSendIntervalMs;
    }

    if (burstUntilMs === null || nextBurstSendAtMs > burstUntilMs) {
      nextBurstSendAtMs = null;
    }
  };

  async function runAutoSendSchedule(): Promise<void> {
    autoSendTimer = null;

    if (!controllerState.isActive()) {
      return;
    }

    if (isManualMode()) {
      stopContinuousSending('continuousStopped', { dropPendingFrame: true });
      return;
    }

    applyCaptureQuality();
    const timestampMs = nowMs();
    const burstNormalized = normalizeBurstWindow();
    const baselineDue = timestampMs >= nextBaselineSendAtMs;
    const burstDue = (
      burstUntilMs !== null
      && nextBurstSendAtMs !== null
      && nextBurstSendAtMs <= burstUntilMs
      && timestampMs >= nextBurstSendAtMs
    );

    if (baselineDue || burstDue) {
      advanceBaselineSchedule(timestampMs);
      advanceBurstSchedule(timestampMs);

      if (latestCapturedFrame) {
        await queueAutoFrameSend(burstDue && !baselineDue ? 'burst' : 'base');
      }
    }

    if (burstNormalized) {
      flushVisualDiagnostics();
    }
    scheduleNextAutoSend();
  }

  const stopContinuousSending = (
    reason: VisualSendEvent = 'continuousStopped',
    options: { dropPendingFrame?: boolean } = {},
  ): void => {
    if (options.dropPendingFrame) {
      resetFrameSendChain();
    }

    const hadContinuousActivity = diagnostics.continuousActive || diagnostics.burstActive;
    resetAutoScheduling();

    if (!hadContinuousActivity) {
      return;
    }

    diagnostics = {
      ...diagnostics,
      continuousActive: false,
      continuousStoppedAt: toIsoTimestamp(nowMs()),
      burstActive: false,
      burstUntil: null,
    };
    setLastEvent(reason);

    flushVisualDiagnostics();
  };

  const startContinuousSending = (): void => {
    if (!controllerState.isActive() || isManualMode()) {
      return;
    }

    const timestampMs = nowMs();
    const startedFresh = !diagnostics.continuousActive;

    manualSendPending = false;
    diagnostics = {
      ...diagnostics,
      manualSendPending: false,
      continuousActive: true,
      continuousStartedAt: startedFresh
        ? toIsoTimestamp(timestampMs)
        : diagnostics.continuousStartedAt,
    };

    if (!Number.isFinite(nextBaselineSendAtMs)) {
      nextBaselineSendAtMs = timestampMs + continuousSendIntervalMs;
    }

    if (startedFresh) {
      setLastEvent('continuousStarted');
    }

    applyCaptureQuality();
    flushVisualDiagnostics();
    scheduleNextAutoSend();
  };

  const canArmManualSend = (): boolean => {
    return (
      !manualSendPending
      && nowMs() - lastManualSendRequestedAt >= MANUAL_SEND_DEBOUNCE_MS
    );
  };

  const activateBurstWindow = (timestampMs: number): void => {
    const wasActive = burstUntilMs !== null && timestampMs < burstUntilMs;
    const nextBurstUntilMs = timestampMs + burstWindowMs;

    diagnostics = {
      ...diagnostics,
      meaningfulChangeCount: diagnostics.meaningfulChangeCount + 1,
      burstActivationCount: diagnostics.burstActivationCount + (wasActive ? 0 : 1),
    };

    burstUntilMs = Math.max(burstUntilMs ?? 0, nextBurstUntilMs);
    nextBurstSendAtMs = nextBurstSendAtMs === null
      ? timestampMs + burstSendIntervalMs
      : Math.min(nextBurstSendAtMs, timestampMs + burstSendIntervalMs);
    syncBurstDiagnostics();

    if (!wasActive) {
      setLastEvent('burstActivated');
    }

    flushVisualDiagnostics();
    scheduleNextAutoSend();
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
      const sentAt = toIsoTimestamp(nowMs());

      if (manualSendPending) {
        if (activeCapture) {
          frameDumpCoordinator.persistSentFrame(
            activeCapture.capture,
            activeCapture.generation,
            frame,
            {
              savedAt: sentAt,
              mode: 'manual',
              quality: 'high',
              reason: 'manual',
            },
          );
        }

        manualSendPending = false;
        diagnostics = {
          ...diagnostics,
          manualSendPending: false,
          manualFramesSentCount: diagnostics.manualFramesSentCount + 1,
          lastManualFrameAt: sentAt,
        };
        setLastEvent('manualFrameSent');
        store.getState().setScreenCaptureState('capturing');
      } else {
        const continuousFrameReason = continuousFrameReasons.get(frame) ?? 'base';

        if (activeCapture) {
          frameDumpCoordinator.persistSentFrame(
            activeCapture.capture,
            activeCapture.generation,
            frame,
            frameDumpMetadata.get(frame) ?? {
              savedAt: sentAt,
              mode: 'continuous',
              quality: resolveRequestedCaptureQuality(),
              reason: continuousFrameReason,
            },
          );
        }

        diagnostics = {
          ...diagnostics,
          continuousFramesSentCount: diagnostics.continuousFramesSentCount + 1,
          lastContinuousFrameAt: sentAt,
          lastContinuousFrameReason: continuousFrameReason,
        };
        setLastEvent(
          continuousFrameReason === 'burst'
            ? 'continuousBurstFrameSent'
            : 'continuousBaseFrameSent',
        );
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
        void frameSendCoordinator.enqueueFrameSend(
          buildFrameDumpMetadata(cloneFrameForSend(frame), {
            savedAt: toIsoTimestamp(nowMs()),
            mode: 'manual',
            quality: 'high',
            reason: 'manual',
          }),
        );
      }
      return;
    }

    const burstObservation = burstDetector.observe(frame.analysis, nowMs());
    if (burstObservation.triggered) {
      activateBurstWindow(nowMs());
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
      manualSendPending = false;
      resetAutoScheduling();
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
