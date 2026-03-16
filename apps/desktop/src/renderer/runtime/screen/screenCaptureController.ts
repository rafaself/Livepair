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
  createBurstSendGate,
} from './visualChangeDetector';
import type { VisualChangeDetectorOptions, BurstSendGateOptions } from './visualChangeDetector';
import {
  createAdaptiveQualityPolicy,
  QUALITY_PROMOTION_DURATION_MS,
} from './adaptiveQualityPolicy';
import type { ContinuousScreenQuality, ScreenContextMode } from '../../../shared/settings';
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
export const VISUAL_BURST_STABLE_FRAMES = 3;

/** Minimum interval between burst frame sends in milliseconds. */
export const VISUAL_BURST_SEND_COOLDOWN_MS = 1000;

/** Hard cap on frames sent per burst (Wave 6). */
export const VISUAL_BURST_MAX_FRAMES = 5;

/** Absolute maximum burst lifetime in milliseconds, regardless of timer resets (Wave 6). */
export const VISUAL_BURST_MAX_LIFETIME_MS = 15_000;

/** Minimum interval between consecutive bursts in milliseconds (Wave 6). */
export const VISUAL_BURST_REENTRY_COOLDOWN_MS = 3_000;

/** Minimum interval between accepted manual-send requests in milliseconds. */
export const MANUAL_SEND_DEBOUNCE_MS = 1_000;

export type ScreenCaptureControllerOptions = {
  visualSendPolicyOptions?: VisualSendPolicyOptions;
  visualChangeDetectorOptions?: VisualChangeDetectorOptions;
  burstSendGateOptions?: BurstSendGateOptions;
  burstDurationMs?: number;
  burstStableFrames?: number;
  burstSendCooldownMs?: number;
  burstMaxFrames?: number;
  burstMaxLifetimeMs?: number;
  burstReentryCooldownMs?: number;
  promotionDurationMs?: number;
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
  const burstDurationMs = controllerOptions?.burstDurationMs ?? VISUAL_BURST_DURATION_MS;
  const burstStableFrames = controllerOptions?.burstStableFrames ?? VISUAL_BURST_STABLE_FRAMES;
  const burstSendCooldownMs = controllerOptions?.burstSendCooldownMs ?? VISUAL_BURST_SEND_COOLDOWN_MS;
  const burstMaxFrames = controllerOptions?.burstMaxFrames ?? VISUAL_BURST_MAX_FRAMES;
  const burstMaxLifetimeMs = controllerOptions?.burstMaxLifetimeMs ?? VISUAL_BURST_MAX_LIFETIME_MS;
  const burstReentryCooldownMs = controllerOptions?.burstReentryCooldownMs ?? VISUAL_BURST_REENTRY_COOLDOWN_MS;
  const promotionDurationMs = controllerOptions?.promotionDurationMs ?? QUALITY_PROMOTION_DURATION_MS;
  const nowMs = controllerOptions?.visualSendPolicyOptions?.nowMs ?? (() => Date.now());
  const resolveRuntimeScreenContextMode = (): 'manual' | 'continuous' => {
    return getScreenContextMode?.() === 'continuous' ? 'continuous' : 'manual';
  };
  const isManualMode = (): boolean => resolveRuntimeScreenContextMode() === 'manual';
  const resolveRequestedCaptureQuality = (): ContinuousScreenQuality => {
    return isManualMode() ? 'high' : (getBaselineQuality?.() ?? 'high');
  };
  const visualPolicy = createVisualSendPolicy({
    ...controllerOptions?.visualSendPolicyOptions,
    burstMaxFrames,
    burstReentryCooldownMs,
  });
  const controllerState = createScreenCaptureControllerState();
  const visualChangeDetector = createVisualChangeDetector(
    controllerOptions?.visualChangeDetectorOptions,
  );
  const burstSendGate = createBurstSendGate(controllerOptions?.burstSendGateOptions);

  // Passive burst heuristics – the policy owns the active/cooldown state, while
  // the controller owns change detection, timers, and burst-local send gating.
  let burstTimer: ReturnType<typeof setTimeout> | null = null;
  let burstLifetimeTimer: ReturnType<typeof setTimeout> | null = null;
  let burstStableFrameCount = 0;
  let lastBurstSendAt = 0;
  let passiveBurstStartedAt = 0;

  // ── Adaptive quality ──────────────────────────────────────────────────
  //
  // Quality policy is lazily created at start() using the current baseline
  // from settings.  This ensures we pick up the latest user preference.

  let qualityPolicyBaseline: ContinuousScreenQuality = resolveRequestedCaptureQuality();
  let qualityPolicy = createAdaptiveQualityPolicy(qualityPolicyBaseline);
  let promotionTimer: ReturnType<typeof setTimeout> | null = null;
  let manualSendPending = false;
  let lastManualSendRequestedAt = Number.NEGATIVE_INFINITY;
  let manualFramesSentCount = 0;
  let lastManualFrameAt: string | null = null;

  const clearPromotionTimer = (): void => {
    if (promotionTimer !== null) {
      clearTimeout(promotionTimer);
      promotionTimer = null;
    }
  };

  const applyQualityToCapture = (): void => {
    const capture = controllerState.getActiveCapture();
    if (capture) {
      capture.capture.updateQuality(qualityPolicy.getEffectiveParams());
    }
  };

  const endPromotion = (): void => {
    clearPromotionTimer();
    if (!qualityPolicy.isPromoted()) {
      return;
    }
    qualityPolicy.endPromotion();
    applyQualityToCapture();
  };

  const promoteQuality = (): void => {
    const wasPromoted = qualityPolicy.isPromoted();
    qualityPolicy.promote();
    if (!qualityPolicy.isPromoted()) return; // no-op (already High baseline)
    if (!wasPromoted) applyQualityToCapture();
    clearPromotionTimer();
    promotionTimer = setTimeout(() => {
      promotionTimer = null;
      endPromotion();
    }, promotionDurationMs);
  };

  const resetQualityState = (): void => {
    clearPromotionTimer();
    qualityPolicy.reset();
  };

  const syncQualityPolicyBaseline = (): void => {
    const nextBaseline = resolveRequestedCaptureQuality();

    if (qualityPolicyBaseline === nextBaseline) {
      return;
    }

    clearPromotionTimer();
    qualityPolicyBaseline = nextBaseline;
    qualityPolicy = createAdaptiveQualityPolicy(qualityPolicyBaseline);
    applyQualityToCapture();
  };

  const syncAutomaticPolicyForManualMode = (): void => {
    if (!isManualMode()) {
      return;
    }

    syncQualityPolicyBaseline();
    if (visualPolicy.getState() === 'inactive' || visualPolicy.getState() === 'sleep') {
      return;
    }

    clearPassiveBurstTracking(true);
    visualPolicy.pauseAutomaticSending();
    flushVisualDiagnostics();
  };

  const canArmManualSend = (): boolean => {
    return (
      !manualSendPending
      && nowMs() - lastManualSendRequestedAt >= MANUAL_SEND_DEBOUNCE_MS
    );
  };

  const armManualSend = (): boolean => {
    if (!canArmManualSend()) {
      return false;
    }

    syncAutomaticPolicyForManualMode();
    syncQualityPolicyBaseline();
    manualSendPending = true;
    lastManualSendRequestedAt = nowMs();
    applyQualityToCapture();
    return true;
  };

  const resetManualSendRuntime = (): void => {
    manualSendPending = false;
    lastManualSendRequestedAt = Number.NEGATIVE_INFINITY;
  };

  const armSnapshot = (action: () => void): boolean => {
    const previousState = visualPolicy.getState();
    action();
    return previousState !== 'snapshot' && visualPolicy.getState() === 'snapshot';
  };

  const flushVisualDiagnostics = (): void => {
    store.getState().setVisualSendDiagnostics({
      ...visualPolicy.getDiagnostics(),
      manualFramesSentCount,
      lastManualFrameAt,
    });
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

  const clearBurstLifetimeTimer = (): void => {
    if (burstLifetimeTimer !== null) {
      clearTimeout(burstLifetimeTimer);
      burstLifetimeTimer = null;
    }
  };

  let resetFrameSendChain = (): void => {};

  const clearPassiveBurstTracking = (dropPendingFrame = false): void => {
    burstStableFrameCount = 0;
    lastBurstSendAt = 0;
    passiveBurstStartedAt = 0;
    clearBurstTimer();
    clearBurstLifetimeTimer();
    burstSendGate.reset();
    if (dropPendingFrame) {
      resetFrameSendChain();
    }
  };

  const endBurst = (): void => {
    if (!visualPolicy.isPassiveBurstActive()) return;
    clearPassiveBurstTracking();
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

  const resetBurstLifetimeTimer = (): void => {
    clearBurstLifetimeTimer();
    burstLifetimeTimer = setTimeout(() => {
      burstLifetimeTimer = null;
      endBurst();
    }, burstMaxLifetimeMs);
  };

  const startBurst = (): void => {
    const wasPassiveBurstActive = visualPolicy.isPassiveBurstActive();
    visualPolicy.startBurst();
    if (wasPassiveBurstActive || !visualPolicy.isPassiveBurstActive()) {
      return;
    }
    clearPassiveBurstTracking();
    passiveBurstStartedAt = nowMs();
    flushVisualDiagnostics();
    resetBurstTimer();
    resetBurstLifetimeTimer();
  };

  // ── Visual change detection (called for every captured frame) ────────────

  const handleFrameCaptured = (frame: { data: Uint8Array }): void => {
    if (isManualMode()) {
      syncAutomaticPolicyForManualMode();
      return;
    }

    syncQualityPolicyBaseline();
    if (
      visualPolicy.isPassiveBurstActive()
      && nowMs() - passiveBurstStartedAt >= burstMaxLifetimeMs
    ) {
      endBurst();
    }

    const changed = visualChangeDetector.onFrame(frame);

    if (changed) {
      if (visualPolicy.getState() === 'sleep') {
        startBurst();
      } else if (visualPolicy.isPassiveBurstActive()) {
        // Decay: subtract 1 credit instead of resetting to 0.
        // This way intermittent noise slows stabilization rather than
        // preventing it entirely.
        burstStableFrameCount = Math.max(0, burstStableFrameCount - 1);
        resetBurstTimer();
      }
    } else if (visualPolicy.isPassiveBurstActive()) {
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
    allowSend: () => {
      if (isManualMode()) {
        syncAutomaticPolicyForManualMode();
        return manualSendPending;
      }

      return visualPolicy.allowSend();
    },
    onFrameDispatched: () => {
      if (isManualMode()) {
        flushVisualDiagnostics();
        return;
      }

      const wasSnapshot = visualPolicy.getState() === 'snapshot';
      const wasPassiveBurstActive = visualPolicy.isPassiveBurstActive();
      visualPolicy.onFrameDispatched();
      if (wasSnapshot) {
        endPromotion();
      }
      if (wasPassiveBurstActive && !visualPolicy.isPassiveBurstActive()) {
        clearPassiveBurstTracking();
      }
      flushVisualDiagnostics();
    },
    onFrameDroppedByPolicy: () => {
      visualPolicy.onFrameDroppedByPolicy();
    },
    onFrameBlockedByGateway: () => {
      visualPolicy.onFrameBlockedByGateway();
    },
    shouldSendFrame: (frame) => {
      if (isManualMode()) {
        return true;
      }

      // Only gate burst sends; explicit streaming and snapshots pass through.
      if (!visualPolicy.isPassiveBurstActive()) return true;

      // Throttle: enforce minimum interval between burst sends.
      const now = nowMs();
      if (now - lastBurstSendAt < burstSendCooldownMs) {
        return false;
      }

      // Visual gate: suppress near-duplicate frames vs last sent.
      if (!burstSendGate.shouldSend(frame)) {
        return false;
      }

      burstSendGate.onFrameSent(frame);
      lastBurstSendAt = now;
      return true;
    },
    flushVisualDiagnostics,
    onSendStarted: () => {
      store.getState().setScreenCaptureDiagnostics({
        lastUploadStatus: 'sending',
        lastError: null,
      });
    },
    onSendSucceeded: (frame) => {
      if (isManualMode()) {
        manualSendPending = false;
        manualFramesSentCount += 1;
        lastManualFrameAt = new Date(nowMs()).toISOString();
        const activeCapture = controllerState.getActiveCapture();

        if (activeCapture) {
          frameDumpCoordinator.persistFrame(activeCapture.capture, activeCapture.generation, frame);
        }

        store.getState().setScreenCaptureState('capturing');
        store.getState().setScreenCaptureDiagnostics({
          lastUploadStatus: 'sent',
          lastError: null,
        });
        flushVisualDiagnostics();
        return;
      }

      store.getState().setScreenCaptureState('streaming');
      store.getState().setScreenCaptureDiagnostics({
        lastUploadStatus: 'sent',
        lastError: null,
      });
    },
    onSendFailed: (detail) => {
      manualSendPending = false;
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
    shouldPersistFrameOnCapture: () => !isManualMode(),
    getCaptureStartParams: () => qualityPolicy.getEffectiveParams(),
    onScreenShareStarted: () => {
      visualPolicy.onScreenShareStarted();

      if (isManualMode()) {
        flushVisualDiagnostics();
        return;
      }

      // Bootstrap: send exactly one initial frame so the model has visual
      // context, then return to sleep.  Continuous streaming is NOT enabled
      // by default — the visual send policy remains the authority over
      // subsequent frame delivery.
      visualPolicy.armBootstrapSnapshot();
      flushVisualDiagnostics();
    },
    onScreenShareStopped: () => {
      clearBurstTimer();
      clearBurstLifetimeTimer();
      clearPassiveBurstTracking();
      visualChangeDetector.reset();
      resetQualityState();
      resetManualSendRuntime();
      visualPolicy.onScreenShareStopped();
      flushVisualDiagnostics();
    },
  });
  stopInternal = lifecycle.stopInternal;
  resetFrameSendChain = frameSendCoordinator.reset;

  return {
    start: () => {
      // Reinitialize quality policy with fresh baseline on each start so
      // the latest user preference is picked up.
      qualityPolicyBaseline = resolveRequestedCaptureQuality();
      qualityPolicy = createAdaptiveQualityPolicy(qualityPolicyBaseline);
      return lifecycle.start();
    },
    stop: lifecycle.stop,
    stopInternal: lifecycle.stopInternal,
    resetDiagnostics,
    enqueueFrameSend: frameSendCoordinator.enqueueFrameSend,
    isActive: lifecycle.isActive,
    resetSendChain: frameSendCoordinator.reset,
    getVisualSendState: () => visualPolicy.getState(),
    analyzeScreenNow: () => {
      if (!lifecycle.isActive()) return;
      if (isManualMode()) {
        if (armManualSend()) {
          flushVisualDiagnostics();
        }
        return;
      }

      syncQualityPolicyBaseline();
      const hadPassiveBurst = visualPolicy.isPassiveBurstActive();
      const didArmSnapshot = armSnapshot(() => {
        visualPolicy.analyzeScreenNow();
      });
      if (didArmSnapshot) {
        promoteQuality();
      }
      if (hadPassiveBurst && !visualPolicy.isPassiveBurstActive()) {
        clearPassiveBurstTracking(true);
      }
      flushVisualDiagnostics();
    },
    enableStreaming: () => {
      if (isManualMode()) {
        syncAutomaticPolicyForManualMode();
        return;
      }

      syncQualityPolicyBaseline();
      const hadPassiveBurst = visualPolicy.isPassiveBurstActive();
      visualPolicy.enableStreaming();
      if (hadPassiveBurst && !visualPolicy.isPassiveBurstActive()) {
        clearPassiveBurstTracking(true);
      }
      flushVisualDiagnostics();
    },
    stopStreaming: () => {
      if (isManualMode()) {
        syncAutomaticPolicyForManualMode();
        return;
      }

      syncQualityPolicyBaseline();
      const hadPassiveBurst = visualPolicy.isPassiveBurstActive();
      // Return to baseline quality when streaming stops.
      if (qualityPolicy.isPromoted()) {
        resetQualityState();
        applyQualityToCapture();
      }
      visualPolicy.stopStreaming();
      if (hadPassiveBurst && !visualPolicy.isPassiveBurstActive()) {
        clearPassiveBurstTracking(true);
      }
      flushVisualDiagnostics();
    },
    onSpeechStart: () => {
      if (!lifecycle.isActive()) return;
      if (isManualMode()) {
        syncAutomaticPolicyForManualMode();
        return;
      }

      syncQualityPolicyBaseline();
      const hadPassiveBurst = visualPolicy.isPassiveBurstActive();
      const didArmSnapshot = armSnapshot(() => {
        visualPolicy.triggerSnapshot('speechTrigger');
      });
      if (didArmSnapshot) {
        promoteQuality();
      }
      if (hadPassiveBurst && !visualPolicy.isPassiveBurstActive()) {
        clearPassiveBurstTracking(true);
      }
      flushVisualDiagnostics();
    },
    onTextSent: () => {
      if (!lifecycle.isActive()) return;
      if (isManualMode()) {
        syncAutomaticPolicyForManualMode();
        return;
      }

      syncQualityPolicyBaseline();
      const hadPassiveBurst = visualPolicy.isPassiveBurstActive();
      const didArmSnapshot = armSnapshot(() => {
        visualPolicy.triggerSnapshot('textTrigger');
      });
      if (didArmSnapshot) {
        promoteQuality();
      }
      if (hadPassiveBurst && !visualPolicy.isPassiveBurstActive()) {
        clearPassiveBurstTracking(true);
      }
      flushVisualDiagnostics();
    },
  };
}
