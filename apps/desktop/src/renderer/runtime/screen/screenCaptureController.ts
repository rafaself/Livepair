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
import type { AdaptiveQualityPolicyOptions } from './adaptiveQualityPolicy';
import type { VisualSessionQuality } from '../../../shared/settings';
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

export type ScreenCaptureControllerOptions = {
  visualSendPolicyOptions?: VisualSendPolicyOptions;
  visualChangeDetectorOptions?: VisualChangeDetectorOptions;
  burstSendGateOptions?: BurstSendGateOptions;
  adaptiveQualityPolicyOptions?: AdaptiveQualityPolicyOptions;
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
  getBaselineQuality?: () => VisualSessionQuality,
): ScreenCaptureController {
  const visualPolicy = createVisualSendPolicy(controllerOptions?.visualSendPolicyOptions);
  const controllerState = createScreenCaptureControllerState();
  const visualChangeDetector = createVisualChangeDetector(
    controllerOptions?.visualChangeDetectorOptions,
  );

  const burstDurationMs = controllerOptions?.burstDurationMs ?? VISUAL_BURST_DURATION_MS;
  const burstStableFrames = controllerOptions?.burstStableFrames ?? VISUAL_BURST_STABLE_FRAMES;
  const burstSendCooldownMs = controllerOptions?.burstSendCooldownMs ?? VISUAL_BURST_SEND_COOLDOWN_MS;
  const burstMaxFrames = controllerOptions?.burstMaxFrames ?? VISUAL_BURST_MAX_FRAMES;
  const burstMaxLifetimeMs = controllerOptions?.burstMaxLifetimeMs ?? VISUAL_BURST_MAX_LIFETIME_MS;
  const burstReentryCooldownMs = controllerOptions?.burstReentryCooldownMs ?? VISUAL_BURST_REENTRY_COOLDOWN_MS;
  const promotionDurationMs = controllerOptions?.promotionDurationMs ?? QUALITY_PROMOTION_DURATION_MS;
  const nowMs = controllerOptions?.visualSendPolicyOptions?.nowMs ?? (() => Date.now());
  const burstSendGate = createBurstSendGate(controllerOptions?.burstSendGateOptions);

  // Burst state – managed by the controller, not the policy
  let burstTimer: ReturnType<typeof setTimeout> | null = null;
  let isBurstActive = false;
  let burstStableFrameCount = 0;
  let lastBurstSendAt = 0;
  let burstFramesSent = 0;
  let burstStartedAt = 0;
  let lastBurstEndedAt = 0;

  // ── Adaptive quality ──────────────────────────────────────────────────
  //
  // Quality policy is lazily created at start() using the current baseline
  // from settings.  This ensures we pick up the latest user preference.

  let qualityPolicy = createAdaptiveQualityPolicy(
    getBaselineQuality?.() ?? 'High',
    controllerOptions?.adaptiveQualityPolicyOptions,
  );
  let promotionTimer: ReturnType<typeof setTimeout> | null = null;

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

  const promoteQuality = (): void => {
    const wasPromoted = qualityPolicy.isPromoted();
    qualityPolicy.promote();
    if (!qualityPolicy.isPromoted()) return; // no-op (already High baseline)
    if (!wasPromoted) applyQualityToCapture();
    clearPromotionTimer();
    promotionTimer = setTimeout(() => {
      promotionTimer = null;
      qualityPolicy.endPromotion();
      applyQualityToCapture();
    }, promotionDurationMs);
  };

  const resetQualityState = (): void => {
    clearPromotionTimer();
    qualityPolicy.reset();
  };

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
    lastBurstSendAt = 0;
    burstFramesSent = 0;
    lastBurstEndedAt = nowMs();
    burstStartedAt = 0;
    clearBurstTimer();
    burstSendGate.reset();
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
    if (lastBurstEndedAt > 0 && nowMs() - lastBurstEndedAt < burstReentryCooldownMs) {
      return;
    }
    isBurstActive = true;
    burstStableFrameCount = 0;
    burstFramesSent = 0;
    burstStartedAt = nowMs();
    visualPolicy.startBurst();
    flushVisualDiagnostics();
    resetBurstTimer();
  };

  // ── Visual change detection (called for every captured frame) ────────────

  const handleFrameCaptured = (frame: { data: Uint8Array }): void => {
    // Wave 6: end burst early if hard budget or lifetime exceeded
    if (isBurstActive) {
      if (
        burstFramesSent >= burstMaxFrames
        || nowMs() - burstStartedAt >= burstMaxLifetimeMs
      ) {
        endBurst();
      }
    }

    const changed = visualChangeDetector.onFrame(frame);

    if (changed) {
      if (visualPolicy.getState() === 'sleep') {
        startBurst();
      } else if (isBurstActive) {
        // Decay: subtract 1 credit instead of resetting to 0.
        // This way intermittent noise slows stabilization rather than
        // preventing it entirely.
        burstStableFrameCount = Math.max(0, burstStableFrameCount - 1);
        // Wave 6: only reset the timer if lifetime allows
        if (nowMs() - burstStartedAt < burstMaxLifetimeMs) {
          resetBurstTimer();
        }
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
    shouldSendFrame: (frame) => {
      // Only gate burst sends; explicit streaming and snapshots pass through.
      if (!isBurstActive) return true;

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
      burstFramesSent += 1;
      return true;
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
    getCaptureStartParams: () => qualityPolicy.getEffectiveParams(),
    onScreenShareStarted: () => {
      visualPolicy.onScreenShareStarted();
      // Bootstrap: send exactly one initial frame so the model has visual
      // context, then return to sleep.  Continuous streaming is NOT enabled
      // by default — the visual send policy remains the authority over
      // subsequent frame delivery.
      visualPolicy.armBootstrapSnapshot();
      // Bootstrap snapshot should use promoted quality for clear first impression.
      promoteQuality();
      flushVisualDiagnostics();
    },
    onScreenShareStopped: () => {
      clearBurstTimer();
      isBurstActive = false;
      burstStableFrameCount = 0;
      lastBurstSendAt = 0;
      burstFramesSent = 0;
      burstStartedAt = 0;
      lastBurstEndedAt = 0;
      visualChangeDetector.reset();
      burstSendGate.reset();
      resetQualityState();
      visualPolicy.onScreenShareStopped();
      flushVisualDiagnostics();
    },
  });
  stopInternal = lifecycle.stopInternal;

  return {
    start: () => {
      // Reinitialize quality policy with fresh baseline on each start so
      // the latest user preference is picked up.
      qualityPolicy = createAdaptiveQualityPolicy(
        getBaselineQuality?.() ?? 'High',
        controllerOptions?.adaptiveQualityPolicyOptions,
      );
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
      // Explicit user action: clear any active burst without setting re-entry cooldown
      if (isBurstActive) {
        clearBurstTimer();
        isBurstActive = false;
        burstStableFrameCount = 0;
        lastBurstSendAt = 0;
        burstFramesSent = 0;
        burstStartedAt = 0;
        burstSendGate.reset();
      }
      // Promote quality for explicit analyze — likely text-heavy content.
      promoteQuality();
      visualPolicy.analyzeScreenNow();
      flushVisualDiagnostics();
    },
    enableStreaming: () => {
      // Explicit streaming overrides burst without setting re-entry cooldown
      clearBurstTimer();
      isBurstActive = false;
      burstStableFrameCount = 0;
      lastBurstSendAt = 0;
      burstFramesSent = 0;
      burstStartedAt = 0;
      burstSendGate.reset();
      visualPolicy.enableStreaming();
      flushVisualDiagnostics();
    },
    stopStreaming: () => {
      clearBurstTimer();
      isBurstActive = false;
      burstStableFrameCount = 0;
      lastBurstSendAt = 0;
      burstFramesSent = 0;
      burstStartedAt = 0;
      burstSendGate.reset();
      // Return to baseline quality when streaming stops.
      if (qualityPolicy.isPromoted()) {
        resetQualityState();
        applyQualityToCapture();
      }
      visualPolicy.stopStreaming();
      flushVisualDiagnostics();
    },
    onSpeechStart: () => {
      if (!lifecycle.isActive()) return;
      promoteQuality();
      visualPolicy.triggerSnapshot('speechTrigger');
      flushVisualDiagnostics();
    },
    onTextSent: () => {
      if (!lifecycle.isActive()) return;
      promoteQuality();
      visualPolicy.triggerSnapshot('textTrigger');
      flushVisualDiagnostics();
    },
  };
}
