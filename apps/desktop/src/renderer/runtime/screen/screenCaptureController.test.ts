import { describe, expect, it, vi } from 'vitest';
import { createScreenCaptureController, VISUAL_BURST_DURATION_MS, VISUAL_BURST_STABLE_FRAMES, VISUAL_BURST_SEND_COOLDOWN_MS, VISUAL_BURST_MAX_FRAMES, VISUAL_BURST_MAX_LIFETIME_MS, VISUAL_BURST_REENTRY_COOLDOWN_MS } from './screenCaptureController';
import type { VisualSendPolicyOptions } from './visualSendPolicy';
import { createDefaultRealtimeOutboundDiagnostics } from '../outbound/realtimeOutboundGateway';
import type { DesktopSession } from '../transport/transport.types';
import type {
  RealtimeOutboundDecision,
  RealtimeOutboundEvent,
  RealtimeOutboundGateway,
} from '../outbound/outbound.types';
import type { VoiceSessionStatus } from '../voice/voice.types';
import type { ScreenCaptureState } from './screen.types';
import type {
  LocalScreenCapture,
  LocalScreenCaptureObserver,
} from './localScreenCapture';
import {
  SCREEN_CAPTURE_FRAME_RATE_HZ,
  SCREEN_CAPTURE_JPEG_QUALITY,
  SCREEN_CAPTURE_MAX_WIDTH_PX,
} from './localScreenCapture';
import type { VisualSessionQuality } from '../../../shared/settings';
import { getScreenCaptureQualityParams } from './screenCapturePolicy';
import { QUALITY_PROMOTION_DURATION_MS } from './adaptiveQualityPolicy';

function createHarness(options: {
  voiceSessionStatus?: VoiceSessionStatus;
  screenCaptureState?: ScreenCaptureState;
  saveScreenFramesEnabled?: boolean;
  submitDecision?: (callIndex: number) => RealtimeOutboundDecision;
  visualSendPolicyOptions?: VisualSendPolicyOptions;
  burstDurationMs?: number;
  burstStableFrames?: number;
  burstSendCooldownMs?: number;
  burstMaxFrames?: number;
  burstMaxLifetimeMs?: number;
  burstReentryCooldownMs?: number;
  getBaselineQuality?: () => VisualSessionQuality;
  promotionDurationMs?: number;
} = {}) {
  const { voiceSessionStatus = 'ready', screenCaptureState = 'disabled' } = options;
  let currentScreenState: ScreenCaptureState = screenCaptureState;
  let currentVoiceStatus: VoiceSessionStatus = voiceSessionStatus;

  const setScreenCaptureState = vi.fn((s: ScreenCaptureState) => { currentScreenState = s; });
  const setScreenCaptureDiagnostics = vi.fn();
  const setVisualSendDiagnostics = vi.fn();
  const setLastRuntimeError = vi.fn();
  const store = {
    getState: () => ({
      voiceSessionStatus: currentVoiceStatus,
      screenCaptureState: currentScreenState,
      setScreenCaptureState,
      setScreenCaptureDiagnostics,
      setVisualSendDiagnostics,
      setLastRuntimeError,
    }),
  };

  let capturedObserver: LocalScreenCaptureObserver | null = null;
  let resolveStop: (() => void) | null = null;
  let deferStop = false;
  const mockCapture = {
    start: vi.fn(async (_options: Parameters<LocalScreenCapture['start']>[0]) => undefined),
    stop: vi.fn(() => {
      if (!deferStop) {
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        resolveStop = resolve;
      });
    }),
    updateQuality: vi.fn((_params: Parameters<LocalScreenCapture['updateQuality']>[0]) => undefined),
  } satisfies LocalScreenCapture;
  const createCapture = vi.fn((observer: LocalScreenCaptureObserver) => {
    capturedObserver = observer;
    return mockCapture;
  });

  const sendVideoFrame = vi.fn(() => Promise.resolve());
  const transport = { sendVideoFrame } as unknown as DesktopSession;
  let currentTransport: DesktopSession | null = transport;

  const shouldSaveScreenFrames = vi.fn(() => options.saveScreenFramesEnabled ?? false);
  const startScreenFrameDumpSession = vi.fn(async () => ({
    directoryPath: '/tmp/livepair/screen-frame-dumps/current-debug-session',
  }));
  const saveScreenFrameDumpFrame = vi.fn(async () => undefined);
  const setScreenFrameDumpDirectoryPath = vi.fn();
  let gatewaySubmitCount = 0;
  const outboundGateway: RealtimeOutboundGateway = {
    submit: vi.fn((_event: RealtimeOutboundEvent): RealtimeOutboundDecision => {
      gatewaySubmitCount += 1;
      return options.submitDecision?.(gatewaySubmitCount) ?? {
        outcome: gatewaySubmitCount === 1 ? 'send' : 'replace',
        classification: 'replaceable',
        reason: gatewaySubmitCount === 1 ? 'accepted' : 'superseded-latest',
      } satisfies RealtimeOutboundDecision;
    }),
    settle: vi.fn(),
    recordFailure: vi.fn(),
    recordSuccess: vi.fn(),
    reset: vi.fn(),
    getDiagnostics: vi.fn(createDefaultRealtimeOutboundDiagnostics),
  };

  const hasControllerOptions = options.visualSendPolicyOptions || options.burstDurationMs != null || options.burstStableFrames != null || options.burstSendCooldownMs != null || options.burstMaxFrames != null || options.burstMaxLifetimeMs != null || options.burstReentryCooldownMs != null || options.promotionDurationMs != null;
  const controllerOptions = hasControllerOptions
    ? {
        ...(options.visualSendPolicyOptions
          ? { visualSendPolicyOptions: options.visualSendPolicyOptions }
          : {}),
        ...(options.burstDurationMs != null ? { burstDurationMs: options.burstDurationMs } : {}),
        ...(options.burstStableFrames != null ? { burstStableFrames: options.burstStableFrames } : {}),
        ...(options.burstSendCooldownMs != null
          ? { burstSendCooldownMs: options.burstSendCooldownMs }
          : {}),
        ...(options.burstMaxFrames != null ? { burstMaxFrames: options.burstMaxFrames } : {}),
        ...(options.burstMaxLifetimeMs != null ? { burstMaxLifetimeMs: options.burstMaxLifetimeMs } : {}),
        ...(options.burstReentryCooldownMs != null ? { burstReentryCooldownMs: options.burstReentryCooldownMs } : {}),
        ...(options.promotionDurationMs != null
          ? { promotionDurationMs: options.promotionDurationMs }
          : {}),
      }
    : undefined;
  const ctrl = createScreenCaptureController(
    store,
    createCapture,
    () => currentTransport,
    () => outboundGateway,
    {
      shouldSaveFrames: shouldSaveScreenFrames,
      startScreenFrameDumpSession,
      saveScreenFrameDumpFrame,
      setScreenFrameDumpDirectoryPath,
    },
    controllerOptions,
    options.getBaselineQuality,
  );

  return {
    ctrl,
    store: { setScreenCaptureState, setScreenCaptureDiagnostics, setVisualSendDiagnostics, setLastRuntimeError },
    mockCapture,
    createCapture,
    sendVideoFrame,
    getObserver: () => capturedObserver,
    setTransport: (t: DesktopSession | null) => { currentTransport = t; },
    setVoiceStatus: (s: VoiceSessionStatus) => { currentVoiceStatus = s; },
    setScreenState: (s: ScreenCaptureState) => { currentScreenState = s; },
    shouldSaveScreenFrames,
    startScreenFrameDumpSession,
    saveScreenFrameDumpFrame,
    setScreenFrameDumpDirectoryPath,
    outboundGateway,
    enableDeferredStop: () => { deferStop = true; },
    resolveStop: () => {
      resolveStop?.();
      resolveStop = null;
    },
  };
}

describe('createScreenCaptureController', () => {
  it('flushes visual diagnostics through start, bootstrap frame send, and stop', async () => {
    const { ctrl, store } = createHarness();

    await ctrl.start();
    expect(store.setVisualSendDiagnostics).toHaveBeenLastCalledWith({
      lastTransitionReason: 'bootstrap',
      snapshotCount: 1,
      streamingEnteredAt: null,
      streamingEndedAt: null,
      sentByState: {
        snapshot: 0,
        streaming: 0,
      },
      droppedByPolicy: 0,
      blockedByGateway: 0,
      triggerSnapshotCount: 0,
      burstCount: 0,
    });

    await ctrl.enqueueFrameSend({
      data: new Uint8Array([1]),
      mimeType: 'image/jpeg',
      sequence: 1,
      widthPx: 640,
      heightPx: 360,
    });
    expect(store.setVisualSendDiagnostics).toHaveBeenLastCalledWith({
      lastTransitionReason: 'snapshotConsumed',
      snapshotCount: 1,
      streamingEnteredAt: null,
      streamingEndedAt: null,
      sentByState: {
        snapshot: 1,
        streaming: 0,
      },
      droppedByPolicy: 0,
      blockedByGateway: 0,
      triggerSnapshotCount: 0,
      burstCount: 0,
    });

    await ctrl.stop();
    expect(store.setVisualSendDiagnostics).toHaveBeenLastCalledWith({
      lastTransitionReason: 'screenShareStopped',
      snapshotCount: 1,
      streamingEnteredAt: null,
      streamingEndedAt: null,
      sentByState: {
        snapshot: 1,
        streaming: 0,
      },
      droppedByPolicy: 0,
      blockedByGateway: 0,
      triggerSnapshotCount: 0,
      burstCount: 0,
    });
  });

  it('start passes the explicit conservative screen policy to local capture', async () => {
    const { ctrl, mockCapture } = createHarness();

    await ctrl.start();

    expect(mockCapture.start).toHaveBeenCalledWith({
      frameRateHz: SCREEN_CAPTURE_FRAME_RATE_HZ,
      jpegQuality: SCREEN_CAPTURE_JPEG_QUALITY,
      maxWidthPx: SCREEN_CAPTURE_MAX_WIDTH_PX,
    });
  });

  it('keeps the current debug frame dump path available after screen capture stops', async () => {
    const {
      ctrl,
      setScreenFrameDumpDirectoryPath,
    } = createHarness({ saveScreenFramesEnabled: true });

    await ctrl.start();
    setScreenFrameDumpDirectoryPath.mockClear();

    await ctrl.stop();

    expect(setScreenFrameDumpDirectoryPath).not.toHaveBeenCalledWith(null);
  });

  it('resetDiagnostics resets all fields', () => {
    const { ctrl, store } = createHarness();

    ctrl.resetDiagnostics();

    expect(store.setScreenCaptureDiagnostics).toHaveBeenCalledWith({
      captureSource: null,
      frameCount: 0,
      frameRateHz: null,
      widthPx: null,
      heightPx: null,
      lastFrameAt: null,
      lastUploadStatus: 'idle',
      lastError: null,
    });
  });
});

// ---------------------------------------------------------------------------
// Visual send policy integration – Wave 1
//
// After start(), the visual state is 'sleep': capture is running but frames
// are NOT automatically forwarded.  Frames are only sent after an explicit
// request (analyzeScreenNow → snapshot) or an explicit streaming trigger.
// ---------------------------------------------------------------------------
describe('createScreenCaptureController – visual send policy', () => {
  it('sends the first frame automatically after start (bootstrap snapshot)', async () => {
    // start() arms a bootstrap snapshot so the model immediately has visual
    // context. After this single frame, the policy reverts to sleep.
    const { ctrl, getObserver, sendVideoFrame } = createHarness();
    await ctrl.start();

    getObserver()!.onFrame({
      data: new Uint8Array([1, 2, 3]),
      mimeType: 'image/jpeg',
      sequence: 1,
      widthPx: 640,
      heightPx: 360,
    });
    await Promise.resolve();

    expect(sendVideoFrame).toHaveBeenCalledTimes(1);
  });

  it('does not send subsequent frames after the bootstrap snapshot is consumed', async () => {
    // After the bootstrap snapshot, the policy is in sleep. Subsequent frames
    // should NOT be sent unless the caller explicitly enables streaming.
    const { ctrl, getObserver, sendVideoFrame } = createHarness();
    await ctrl.start();

    // First frame: bootstrap snapshot consumed
    getObserver()!.onFrame({
      data: new Uint8Array([1]),
      mimeType: 'image/jpeg',
      sequence: 1,
      widthPx: 640,
      heightPx: 360,
    });
    await Promise.resolve();
    expect(sendVideoFrame).toHaveBeenCalledTimes(1);

    // Second frame: sleep → blocked
    getObserver()!.onFrame({
      data: new Uint8Array([2]),
      mimeType: 'image/jpeg',
      sequence: 2,
      widthPx: 640,
      heightPx: 360,
    });
    await Promise.resolve();
    expect(sendVideoFrame).toHaveBeenCalledTimes(1);
    expect(ctrl.getVisualSendState()).toBe('sleep');
  });

  it('sends exactly one frame after analyzeScreenNow (snapshot)', async () => {
    const { ctrl, getObserver, sendVideoFrame } = createHarness();
    await ctrl.start();
    ctrl.analyzeScreenNow();

    const frame = { data: new Uint8Array([1]), mimeType: 'image/jpeg' as const, sequence: 1, widthPx: 640, heightPx: 360 };
    getObserver()!.onFrame(frame);
    await Promise.resolve();

    expect(sendVideoFrame).toHaveBeenCalledTimes(1);
    expect(sendVideoFrame).toHaveBeenCalledWith(frame.data, frame.mimeType);
  });

  it('returns to sleep after the snapshot frame is sent (next frame is blocked)', async () => {
    const { ctrl, getObserver, sendVideoFrame } = createHarness();
    await ctrl.start();
    ctrl.analyzeScreenNow();

    const mkFrame = (seq: number) => ({
      data: new Uint8Array([seq]),
      mimeType: 'image/jpeg' as const,
      sequence: seq,
      widthPx: 640,
      heightPx: 360,
    });

    // First frame – snapshot consumed
    getObserver()!.onFrame(mkFrame(1));
    await Promise.resolve();
    // Second frame – back in sleep, should be blocked
    getObserver()!.onFrame(mkFrame(2));
    await Promise.resolve();

    expect(sendVideoFrame).toHaveBeenCalledTimes(1);
  });

  it('sends every frame when enableStreaming is called', async () => {
    const { ctrl, getObserver, sendVideoFrame } = createHarness({
      submitDecision: (i) => ({
        outcome: i === 1 ? 'send' : 'replace',
        classification: 'replaceable',
        reason: i === 1 ? 'accepted' : 'superseded-latest',
      }),
    });
    await ctrl.start();
    ctrl.enableStreaming();

    const mkFrame = (seq: number) => ({
      data: new Uint8Array([seq]),
      mimeType: 'image/jpeg' as const,
      sequence: seq,
      widthPx: 640,
      heightPx: 360,
    });

    getObserver()!.onFrame(mkFrame(1));
    await Promise.resolve();
    getObserver()!.onFrame(mkFrame(2));
    await Promise.resolve();

    expect(sendVideoFrame).toHaveBeenCalledTimes(2);
  });

  it('stops sending frames after stopStreaming (back in sleep)', async () => {
    const { ctrl, getObserver, sendVideoFrame } = createHarness();
    await ctrl.start();
    ctrl.enableStreaming();
    ctrl.stopStreaming();

    getObserver()!.onFrame({
      data: new Uint8Array([1]),
      mimeType: 'image/jpeg',
      sequence: 1,
      widthPx: 640,
      heightPx: 360,
    });
    await Promise.resolve();

    expect(sendVideoFrame).not.toHaveBeenCalled();
  });

  it('resets visual state to inactive when stop is called', async () => {
    const { ctrl } = createHarness();
    await ctrl.start();
    ctrl.analyzeScreenNow();
    await ctrl.stop();

    expect(ctrl.getVisualSendState()).toBe('inactive');
  });

  it('visual state is inactive before start is called', () => {
    const { ctrl } = createHarness();
    expect(ctrl.getVisualSendState()).toBe('inactive');
  });

  it('visual state becomes snapshot after start succeeds (bootstrap armed on start)', async () => {
    // start() arms a bootstrap snapshot so the model receives initial visual
    // context. The policy then reverts to sleep after the first frame.
    const { ctrl } = createHarness();
    await ctrl.start();
    expect(ctrl.getVisualSendState()).toBe('snapshot');
  });

  it('visual state becomes snapshot after analyzeScreenNow', async () => {
    const { ctrl } = createHarness();
    await ctrl.start();
    ctrl.analyzeScreenNow();
    expect(ctrl.getVisualSendState()).toBe('snapshot');
  });

  it('visual state becomes streaming after enableStreaming', async () => {
    const { ctrl } = createHarness();
    await ctrl.start();
    ctrl.enableStreaming();
    expect(ctrl.getVisualSendState()).toBe('streaming');
  });
});

// ---------------------------------------------------------------------------
// Visual send policy integration – Wave 2
//
// These tests lock in the integration between the visual send state machine
// and the real frame dispatch pipeline.  They verify that the runtime states
// (inactive / sleep / snapshot / streaming) enforce the correct dispatch
// behavior end-to-end through enqueueFrameSend, including bounded pending
// work and latest-wins semantics.
// ---------------------------------------------------------------------------
describe('createScreenCaptureController – visual send pipeline (Wave 2)', () => {
  const mkFrame = (seq: number) => ({
    data: new Uint8Array([seq]),
    mimeType: 'image/jpeg' as const,
    sequence: seq,
    widthPx: 640,
    heightPx: 360,
  });

  // ── inactive ──────────────────────────────────────────────────────────────

  it('inactive blocks enqueueFrameSend even when capture and transport are present', async () => {
    // Call enqueueFrameSend directly without calling start() so the visual
    // policy stays inactive.  No transport/capture exists either, so the
    // first guard also fires, but this test explicitly verifies the inactive
    // semantic via direct call after wiring a minimal harness where start()
    // was never called.
    const { ctrl, sendVideoFrame } = createHarness();

    // Policy is inactive; no capture, so early-exit fires first – but the
    // meaningful assertion is that nothing reaches the transport.
    await ctrl.enqueueFrameSend(mkFrame(1));

    expect(sendVideoFrame).not.toHaveBeenCalled();
    expect(ctrl.getVisualSendState()).toBe('inactive');
  });

  it('inactive blocks frames even when a capture exists (direct enqueue after teardown)', async () => {
    // Start → stop to get a capture that existed but is now released.
    // Policy transitions inactive → sleep on start, then back to inactive on stop.
    // Any frame arriving via the observer after stop must be dropped.
    const { ctrl, getObserver, sendVideoFrame } = createHarness();

    await ctrl.start();
    // arm streaming so any in-flight frames are allowed, then stop
    ctrl.enableStreaming();
    await ctrl.stop();

    // Simulate a stale frame callback after stop (observer may fire briefly)
    const obs = getObserver();
    if (obs) {
      obs.onFrame(mkFrame(99));
    }
    await Promise.resolve();

    expect(sendVideoFrame).not.toHaveBeenCalled();
    expect(ctrl.getVisualSendState()).toBe('inactive');
  });

  // ── sleep ──────────────────────────────────────────────────────────────────

  it('sleep blocks a burst of frames arriving through the observer', async () => {
    // start() arms a bootstrap snapshot; consume it, then verify a subsequent
    // burst in sleep is blocked.
    const { ctrl, getObserver, sendVideoFrame } = createHarness();
    await ctrl.start();
    // Consume the bootstrap snapshot
    getObserver()!.onFrame(mkFrame(0));
    await Promise.resolve();
    sendVideoFrame.mockClear();

    // Now in sleep; subsequent frames must all be blocked
    for (let i = 1; i <= 6; i++) {
      getObserver()!.onFrame(mkFrame(i));
    }
    await Promise.resolve();

    expect(sendVideoFrame).not.toHaveBeenCalled();
    expect(ctrl.getVisualSendState()).toBe('sleep');
  });

  // ── snapshot ───────────────────────────────────────────────────────────────

  it('snapshot allows exactly one frame even when a burst arrives simultaneously', async () => {
    // Multiple frames arrive while snapshot is armed.  Only the first one that
    // passes allowSend() should reach the transport; subsequent ones are gated
    // back in sleep.
    const { ctrl, getObserver, sendVideoFrame } = createHarness({
      submitDecision: (i) => ({
        outcome: i === 1 ? 'send' : 'replace',
        classification: 'replaceable' as const,
        reason: i === 1 ? 'accepted' : 'superseded-latest',
      }),
    });
    await ctrl.start();
    ctrl.analyzeScreenNow();

    // Burst: 3 frames arrive before the drain loop has a chance to run.
    getObserver()!.onFrame(mkFrame(1));
    getObserver()!.onFrame(mkFrame(2));
    getObserver()!.onFrame(mkFrame(3));
    await Promise.resolve();

    // allowSend() consumed the snapshot on frame 1 → state reverts to sleep.
    // Frames 2 and 3 were blocked by sleep gating.
    expect(sendVideoFrame).toHaveBeenCalledTimes(1);
    expect(ctrl.getVisualSendState()).toBe('sleep');
  });

  it('snapshot: visual pending work is bounded to 1 even under a burst', async () => {
    // While the first snapshot frame is draining (transport call in-flight),
    // additional frames must not accumulate; only the latest-pending slot is kept.
    let resolveFirstSend!: () => void;
    const { ctrl, getObserver, sendVideoFrame, outboundGateway } = createHarness({
      submitDecision: (i) => ({
        outcome: i === 1 ? 'send' : 'replace',
        classification: 'replaceable' as const,
        reason: i === 1 ? 'accepted' : 'superseded-latest',
      }),
    });
    sendVideoFrame.mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveFirstSend = resolve; }),
    );

    await ctrl.start();
    ctrl.analyzeScreenNow();

    // Frame 1 starts draining (transport call in-flight).
    getObserver()!.onFrame(mkFrame(1));
    await Promise.resolve(); // let drain loop start

    // Frames 2 & 3 arrive while frame 1 is still sending.
    // Policy is now sleep (snapshot was consumed by frame 1), so these are
    // blocked at the gate – the gateway is never called for them.
    getObserver()!.onFrame(mkFrame(2));
    getObserver()!.onFrame(mkFrame(3));
    await Promise.resolve();

    // Gateway was called only once (for the snapshot frame).
    expect(outboundGateway.submit).toHaveBeenCalledTimes(1);

    resolveFirstSend();
    await Promise.resolve();
    await Promise.resolve();

    // Only the snapshot frame reached the transport.
    expect(sendVideoFrame).toHaveBeenCalledTimes(1);
  });

  it('re-armed snapshot after sleep sends exactly one more frame', async () => {
    let now = 0;
    const { ctrl, getObserver, sendVideoFrame } = createHarness({
      submitDecision: (i) => ({
        outcome: i <= 2 ? 'send' : 'replace',
        classification: 'replaceable' as const,
        reason: i <= 2 ? 'accepted' : 'superseded-latest',
      }),
      visualSendPolicyOptions: { nowMs: () => now },
    });
    await ctrl.start();

    // First snapshot
    ctrl.analyzeScreenNow();
    getObserver()!.onFrame(mkFrame(1));
    await Promise.resolve();

    // Back to sleep – frame 2 should be blocked
    getObserver()!.onFrame(mkFrame(2));
    await Promise.resolve();
    expect(sendVideoFrame).toHaveBeenCalledTimes(1);

    // Second snapshot – advance past cooldown first
    now += 3000;
    ctrl.analyzeScreenNow();
    getObserver()!.onFrame(mkFrame(3));
    await Promise.resolve();

    expect(sendVideoFrame).toHaveBeenCalledTimes(2);
    expect(ctrl.getVisualSendState()).toBe('sleep');
  });

  // ── streaming ──────────────────────────────────────────────────────────────

  it('streaming: latest-wins is preserved under a concurrent burst', async () => {
    // While frame 1 is draining, frames 2 and 3 arrive.  Only frames 1 and 3
    // should reach the transport (frame 2 is superseded by frame 3 in the
    // single pendingFrame slot).
    let resolveFirstSend!: () => void;
    const { ctrl, getObserver, sendVideoFrame } = createHarness({
      submitDecision: (i) => ({
        outcome: i === 1 ? 'send' : 'replace',
        classification: 'replaceable' as const,
        reason: i === 1 ? 'accepted' : 'superseded-latest',
      }),
    });
    sendVideoFrame
      .mockImplementationOnce(
        () => new Promise<void>((resolve) => { resolveFirstSend = resolve; }),
      )
      .mockResolvedValueOnce(undefined);

    await ctrl.start();
    ctrl.enableStreaming();

    getObserver()!.onFrame(mkFrame(1));
    await Promise.resolve(); // drain starts, frame 1 in-flight

    getObserver()!.onFrame(mkFrame(2));
    getObserver()!.onFrame(mkFrame(3)); // replaces frame 2 in pendingFrame

    resolveFirstSend();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(sendVideoFrame).toHaveBeenCalledTimes(2);
    expect(sendVideoFrame.mock.calls[0]).toEqual([new Uint8Array([1]), 'image/jpeg']);
    expect(sendVideoFrame.mock.calls[1]).toEqual([new Uint8Array([3]), 'image/jpeg']);
  });

  it('streaming: pending work is bounded (never more than 1 queued behind the active send)', async () => {
    // Flood of frames; the pendingFrame slot holds at most 1 waiting frame.
    let resolveFirstSend!: () => void;
    const { ctrl, getObserver, sendVideoFrame, outboundGateway } = createHarness({
      submitDecision: (i) => ({
        outcome: i === 1 ? 'send' : 'replace',
        classification: 'replaceable' as const,
        reason: i === 1 ? 'accepted' : 'superseded-latest',
      }),
    });
    sendVideoFrame.mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveFirstSend = resolve; }),
    ).mockResolvedValue(undefined);

    await ctrl.start();
    ctrl.enableStreaming();

    getObserver()!.onFrame(mkFrame(1));
    await Promise.resolve(); // drain starts

    // 10 more frames arrive; all go through the gateway (replace) but only
    // one pendingFrame slot exists.
    for (let i = 2; i <= 11; i++) {
      getObserver()!.onFrame(mkFrame(i));
    }
    await Promise.resolve();

    // Gateway called for all 11 frames (policy allows, gateway classifies as replaceable).
    expect(outboundGateway.submit).toHaveBeenCalledTimes(11);

    resolveFirstSend();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Despite 11 frames submitted, only 2 reached the transport:
    // frame 1 (first send) + the latest pending frame (frame 11).
    expect(sendVideoFrame).toHaveBeenCalledTimes(2);
  });

  // ── stop / reset ───────────────────────────────────────────────────────────

  it('stopping screen share resets pipeline to non-sending: no frames dispatched after stop', async () => {
    const { ctrl, getObserver, sendVideoFrame } = createHarness();

    await ctrl.start();
    ctrl.enableStreaming();
    await ctrl.stop();

    // After stop, any observer callbacks that fire must be no-ops.
    const obs = getObserver();
    if (obs) {
      obs.onFrame(mkFrame(1));
    }
    await Promise.resolve();

    expect(sendVideoFrame).not.toHaveBeenCalled();
    expect(ctrl.getVisualSendState()).toBe('inactive');
  });

  it('restarting screen share re-arms bootstrap snapshot for the new session', async () => {
    // Each start() arms a bootstrap snapshot so the new capture session
    // immediately delivers one initial frame to the model.
    const { ctrl, getObserver, sendVideoFrame } = createHarness({
      submitDecision: (i) => ({
        outcome: i <= 3 ? 'send' as const : 'replace' as const,
        classification: 'replaceable' as const,
        reason: i <= 3 ? 'accepted' : 'superseded-latest',
      }),
    });

    // First session: bootstrap snapshot delivers one frame
    await ctrl.start();
    getObserver()!.onFrame(mkFrame(1));
    await Promise.resolve();
    expect(sendVideoFrame).toHaveBeenCalledTimes(1);
    await ctrl.stop();
    sendVideoFrame.mockClear();

    // Second session: bootstrap snapshot re-armed by start()
    await ctrl.start();
    getObserver()!.onFrame(mkFrame(2));
    await Promise.resolve();
    expect(sendVideoFrame).toHaveBeenCalledTimes(1);
    // After bootstrap consumed, policy reverts to sleep
    expect(ctrl.getVisualSendState()).toBe('sleep');

    // Further frames are blocked in sleep
    getObserver()!.onFrame(mkFrame(3));
    await Promise.resolve();
    expect(sendVideoFrame).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Visual send policy integration – Wave 3
//
// These tests lock in the screen-capture stabilization requirements:
//   1. Enabling screen share sends an initial snapshot automatically so the
//      model immediately has visual context (no hidden extra steps).
//   2. If the first captured frame is gateway-blocked or dropped, the snapshot
//      is NOT incorrectly consumed (policy stays snapshot-armed for the next
//      frame that can actually reach the model).
//   3. Screen share active no longer leaves the model in speech-only state.
//   4. enableStreaming / stopStreaming are wired on the public ScreenCaptureController
//      surface and tested end-to-end through the public API.
//   5. No regression in sleep / snapshot / streaming policy transitions.
// ---------------------------------------------------------------------------
describe('createScreenCaptureController – screen-capture initial delivery', () => {
  const mkFrame = (seq: number) => ({
    data: new Uint8Array([seq]),
    mimeType: 'image/jpeg' as const,
    sequence: seq,
    widthPx: 640,
    heightPx: 360,
  });

  // ── Requirement 1 & 3: bootstrap snapshot delivers initial visual context ─

  it('enabling screen share arms a bootstrap snapshot so the first frame reaches the model', async () => {
    // start() must arm a bootstrap snapshot so the first frame from the
    // hardware is forwarded to the model without any explicit caller action.
    const { ctrl, getObserver, sendVideoFrame } = createHarness();

    await ctrl.start();

    // First frame from the capture hardware must reach the model without any
    // explicit call from the UI.
    getObserver()!.onFrame(mkFrame(1));
    await Promise.resolve();

    expect(sendVideoFrame).toHaveBeenCalledTimes(1);
    expect(sendVideoFrame).toHaveBeenCalledWith(mkFrame(1).data, mkFrame(1).mimeType);
  });

  it('after the bootstrap snapshot, policy reverts to sleep and blocks subsequent frames', async () => {
    // The bootstrap snapshot delivers exactly one frame. After that, the
    // policy is in sleep and no further frames are sent automatically.
    const { ctrl, getObserver, sendVideoFrame } = createHarness({
      submitDecision: (i) => ({
        outcome: i === 1 ? 'send' as const : 'replace' as const,
        classification: 'replaceable' as const,
        reason: i === 1 ? 'accepted' : 'superseded-latest',
      }),
    });

    await ctrl.start();

    getObserver()!.onFrame(mkFrame(1));
    await Promise.resolve();
    expect(sendVideoFrame).toHaveBeenCalledTimes(1);

    // Second frame is blocked because policy is now in sleep
    getObserver()!.onFrame(mkFrame(2));
    await Promise.resolve();
    expect(sendVideoFrame).toHaveBeenCalledTimes(1);
    expect(ctrl.getVisualSendState()).toBe('sleep');
  });

  it('visual state is snapshot immediately after start (before the first frame arrives)', async () => {
    // Policy must already be armed when start() resolves so a slow capture
    // device is still fully wired for initial delivery.
    const { ctrl } = createHarness();

    await ctrl.start();

    expect(ctrl.getVisualSendState()).toBe('snapshot');
  });

  it('screen share active gives model initial visual context via bootstrap snapshot', async () => {
    // After enabling screen share the assistant receives one initial frame
    // for context. The policy then returns to sleep — continuous delivery
    // requires an explicit enableStreaming() call.
    const { ctrl, getObserver, sendVideoFrame } = createHarness();

    await ctrl.start();
    getObserver()!.onFrame(mkFrame(1));
    await Promise.resolve();

    expect(sendVideoFrame).toHaveBeenCalledTimes(1);
    // Policy reverts to sleep after bootstrap — no continuous delivery by default.
    expect(ctrl.getVisualSendState()).toBe('sleep');
  });

  // ── Requirement 2: gateway-blocked frame does not consume the bootstrap snapshot ─

  it('bootstrap snapshot stays armed when the outbound gateway blocks a frame', async () => {
    // A gateway block does NOT consume the snapshot — the bootstrap frame
    // remains armed for the next attempt when the gateway recovers.
    const { ctrl, getObserver, sendVideoFrame } = createHarness({
      submitDecision: () => ({
        outcome: 'block' as const,
        classification: 'replaceable' as const,
        reason: 'breaker-open',
      }),
    });

    await ctrl.start();

    getObserver()!.onFrame(mkFrame(1));
    await Promise.resolve();

    expect(sendVideoFrame).not.toHaveBeenCalled();
    // Policy remains snapshot – bootstrap is still pending for when the gateway recovers.
    expect(ctrl.getVisualSendState()).toBe('snapshot');
  });

  it('bootstrap snapshot stays armed when the outbound gateway drops a frame', async () => {
    const { ctrl, getObserver, sendVideoFrame } = createHarness({
      submitDecision: () => ({
        outcome: 'drop' as const,
        classification: 'replaceable' as const,
        reason: 'superseded-latest',
      }),
    });

    await ctrl.start();

    getObserver()!.onFrame(mkFrame(1));
    await Promise.resolve();

    expect(sendVideoFrame).not.toHaveBeenCalled();
    expect(ctrl.getVisualSendState()).toBe('snapshot');
  });

  it('bootstrap frame is delivered on the next gateway-accepted attempt after a transient block', async () => {
    // Mixed scenario: first frame blocked, second frame accepted.
    // Both frames pass allowSend() (snapshot); the first is blocked by the
    // gateway (snapshot not consumed), the second gets through.
    let callIndex = 0;
    const { ctrl, getObserver, sendVideoFrame } = createHarness({
      submitDecision: () => {
        callIndex += 1;
        if (callIndex === 1) {
          return { outcome: 'block' as const, classification: 'replaceable' as const, reason: 'breaker-open' };
        }
        return { outcome: 'send' as const, classification: 'replaceable' as const, reason: 'accepted' };
      },
    });

    await ctrl.start();

    // First frame: gateway blocks – snapshot stays armed
    getObserver()!.onFrame(mkFrame(1));
    await Promise.resolve();
    expect(sendVideoFrame).not.toHaveBeenCalled();
    expect(ctrl.getVisualSendState()).toBe('snapshot');

    // Second frame: gateway accepts – bootstrap delivered, reverts to sleep
    getObserver()!.onFrame(mkFrame(2));
    await Promise.resolve();
    expect(sendVideoFrame).toHaveBeenCalledTimes(1);
    expect(ctrl.getVisualSendState()).toBe('sleep');
  });

  // ── Requirement 4: stopStreaming / enableStreaming wired on public ctrl ────

  it('enableStreaming transitions policy from sleep to streaming and enables continuous delivery', async () => {
    const { ctrl, getObserver, sendVideoFrame } = createHarness({
      submitDecision: (i) => ({
        outcome: i <= 2 ? 'send' as const : 'replace' as const,
        classification: 'replaceable' as const,
        reason: i <= 2 ? 'accepted' : 'superseded-latest',
      }),
    });

    await ctrl.start();
    // Consume bootstrap snapshot
    getObserver()!.onFrame(mkFrame(0));
    await Promise.resolve();
    sendVideoFrame.mockClear();

    ctrl.enableStreaming();
    expect(ctrl.getVisualSendState()).toBe('streaming');

    getObserver()!.onFrame(mkFrame(1));
    await Promise.resolve();
    expect(sendVideoFrame).toHaveBeenCalledTimes(1);
  });

  it('stopStreaming transitions policy to sleep and subsequent frames are blocked', async () => {
    const { ctrl, getObserver, sendVideoFrame } = createHarness();

    await ctrl.start();
    // Consume bootstrap, then enable streaming, then stop it
    getObserver()!.onFrame(mkFrame(0));
    await Promise.resolve();
    sendVideoFrame.mockClear();
    ctrl.enableStreaming();
    ctrl.stopStreaming();
    expect(ctrl.getVisualSendState()).toBe('sleep');

    getObserver()!.onFrame(mkFrame(1));
    await Promise.resolve();
    expect(sendVideoFrame).not.toHaveBeenCalled();
  });

  it('visual send diagnostics reflect bootstrap transition reason after start', async () => {
    const { ctrl, store, getObserver } = createHarness();

    await ctrl.start();
    // Diagnostics after start: transition reason reflects bootstrap
    expect(store.setVisualSendDiagnostics).toHaveBeenLastCalledWith(
      expect.objectContaining({ lastTransitionReason: 'bootstrap', snapshotCount: 1 }),
    );

    getObserver()!.onFrame(mkFrame(1));
    await Promise.resolve();

    // A bootstrap frame increments sentByState.snapshot
    expect(store.setVisualSendDiagnostics).toHaveBeenLastCalledWith(
      expect.objectContaining({ lastTransitionReason: 'snapshotConsumed', sentByState: { snapshot: 1, streaming: 0 } }),
    );
  });

  // ── Requirement 5: no regression in existing policy transitions ───────────

  it('analyzeScreenNow arms a one-shot snapshot from sleep', async () => {
    // analyzeScreenNow() is preserved for explicit single-frame captures.
    // From sleep it transitions to snapshot, delivering exactly one frame,
    // then the channel returns to sleep.
    const { ctrl, getObserver, sendVideoFrame } = createHarness({
      submitDecision: (i) => ({
        outcome: i <= 2 ? 'send' as const : 'replace' as const,
        classification: 'replaceable' as const,
        reason: i <= 2 ? 'accepted' : 'superseded-latest',
      }),
      visualSendPolicyOptions: { nowMs: (() => {
        let t = 0;
        return () => { t += 5000; return t; };
      })() },
    });

    await ctrl.start();
    // Consume bootstrap snapshot
    getObserver()!.onFrame(mkFrame(0));
    await Promise.resolve();
    sendVideoFrame.mockClear();

    // Now in sleep. Call analyzeScreenNow to arm a new snapshot.
    ctrl.analyzeScreenNow();
    expect(ctrl.getVisualSendState()).toBe('snapshot');

    // Snapshot frame is sent
    getObserver()!.onFrame(mkFrame(1));
    await Promise.resolve();
    expect(sendVideoFrame).toHaveBeenCalledTimes(1);
    // Back to sleep (snapshot consumed)
    expect(ctrl.getVisualSendState()).toBe('sleep');
  });

  it('stop resets visual state to inactive', async () => {
    const { ctrl, getObserver } = createHarness();

    await ctrl.start();
    getObserver()!.onFrame(mkFrame(1));
    await Promise.resolve();
    await ctrl.stop();

    expect(ctrl.getVisualSendState()).toBe('inactive');
  });

  it('restarting screen share after stop re-arms bootstrap snapshot for the new session', async () => {
    const { ctrl, getObserver, sendVideoFrame } = createHarness({
      submitDecision: (i) => ({
        outcome: i <= 2 ? 'send' as const : 'replace' as const,
        classification: 'replaceable' as const,
        reason: i <= 2 ? 'accepted' : 'superseded-latest',
      }),
    });

    // First session
    await ctrl.start();
    getObserver()!.onFrame(mkFrame(1));
    await Promise.resolve();
    await ctrl.stop();
    sendVideoFrame.mockClear();

    // Second session: bootstrap snapshot must be re-armed
    await ctrl.start();
    expect(ctrl.getVisualSendState()).toBe('snapshot');
    getObserver()!.onFrame(mkFrame(2));
    await Promise.resolve();

    expect(sendVideoFrame).toHaveBeenCalledTimes(1);
    expect(sendVideoFrame).toHaveBeenCalledWith(mkFrame(2).data, mkFrame(2).mimeType);
  });
});

// ---------------------------------------------------------------------------
// Wave 4 – Capture vs Send Diagnostics Separation
//
// Requirements tested:
//   1. A captured frame increments capture diagnostics even if it is never sent.
//   2. A successfully sent frame increments send diagnostics separately.
//   3. A blocked/dropped frame is recorded distinctly and does not appear as sent.
//   4. Frame dump/debug output clearly reflects whether a frame was captured-only or sent.
//   5. No regression in existing screen-capture diagnostics behavior.
// ---------------------------------------------------------------------------
describe('createScreenCaptureController – Wave 4 capture/send diagnostics separation', () => {
  const mkFrame = (seq: number) => ({
    data: new Uint8Array([seq]),
    mimeType: 'image/jpeg' as const,
    sequence: seq,
    widthPx: 640,
    heightPx: 360,
  });

  // ── Requirement 1: captured frame increments capture diagnostics even if not sent ──

  it('capture diagnostics (frameCount) increment for every frame arriving from hardware, regardless of send policy', async () => {
    // In sleep state frames are NOT sent, but capture diagnostics should still
    // update to reflect that the hardware delivered a frame.
    const { ctrl, getObserver, store } = createHarness();

    await ctrl.start();
    // Consume bootstrap snapshot so we're in sleep
    getObserver()!.onFrame(mkFrame(0));
    await Promise.resolve();
    store.setScreenCaptureDiagnostics.mockClear();

    // In sleep – hardware delivers frame but it won't be sent
    getObserver()!.onDiagnostics({ frameCount: 1 });
    expect(store.setScreenCaptureDiagnostics).toHaveBeenCalledWith(
      expect.objectContaining({ frameCount: 1 }),
    );
  });

  // ── Requirement 2: sent frame increments send diagnostics separately ──────

  it('bootstrap frame increments sentByState.snapshot counter in visual send diagnostics', async () => {
    // start() arms a bootstrap snapshot so the first sent frame increments snapshot.
    const { ctrl, store, getObserver } = createHarness();

    await ctrl.start();
    getObserver()!.onFrame(mkFrame(1)); // bootstrap snapshot frame
    await Promise.resolve();

    const lastCall = store.setVisualSendDiagnostics.mock.calls.at(-1)?.[0];
    expect(lastCall).toMatchObject({
      sentByState: { snapshot: 1, streaming: 0 },
    });
  });

  it('streaming frames increment sentByState.streaming after explicit enableStreaming', async () => {
    const { ctrl, store, getObserver } = createHarness({
      submitDecision: (i) => ({
        outcome: i <= 3 ? 'send' as const : 'replace' as const,
        classification: 'replaceable' as const,
        reason: i <= 3 ? 'accepted' : 'superseded-latest',
      }),
    });

    // Consume bootstrap snapshot first, then enable streaming
    await ctrl.start();
    getObserver()!.onFrame(mkFrame(1));
    await Promise.resolve();
    ctrl.enableStreaming();
    getObserver()!.onFrame(mkFrame(2));
    await Promise.resolve();
    getObserver()!.onFrame(mkFrame(3));
    await Promise.resolve();

    const lastCall = store.setVisualSendDiagnostics.mock.calls.at(-1)?.[0];
    expect(lastCall).toMatchObject({
      sentByState: { snapshot: 1, streaming: 2 },
    });
  });

  // ── Requirement 3: blocked/dropped frame is recorded and does not appear as sent ──

  it('a frame blocked by the outbound gateway increments blockedByGateway, not sentByState', async () => {
    const { ctrl, getObserver, store } = createHarness({
      submitDecision: () => ({
        outcome: 'block' as const,
        classification: 'replaceable' as const,
        reason: 'breaker-open',
      }),
    });

    await ctrl.start();
    // bootstrap snapshot is armed; frame 1 passes allowSend() but gateway blocks it
    getObserver()!.onFrame(mkFrame(1));
    await Promise.resolve();

    const lastDiagnostics = store.setVisualSendDiagnostics.mock.calls.at(-1)?.[0];
    expect(lastDiagnostics).toMatchObject({
      blockedByGateway: expect.any(Number),
      sentByState: { snapshot: 0, streaming: 0 },
    });
    expect(lastDiagnostics.blockedByGateway).toBeGreaterThan(0);
  });

  it('a frame blocked by the policy (sleep/inactive) increments droppedByPolicy, not sentByState', async () => {
    const { ctrl, getObserver, store } = createHarness();

    await ctrl.start();
    // Send frame 1 via bootstrap snapshot, then policy reverts to sleep
    getObserver()!.onFrame(mkFrame(1));
    await Promise.resolve();
    store.setVisualSendDiagnostics.mockClear();

    // Sleep state – next frame is policy-blocked
    getObserver()!.onFrame(mkFrame(2));
    await Promise.resolve();

    const lastDiagnostics = store.setVisualSendDiagnostics.mock.calls.at(-1)?.[0];
    expect(lastDiagnostics).toMatchObject({
      droppedByPolicy: expect.any(Number),
      // sentByState reflects only the earlier bootstrap send, not the dropped frame
      sentByState: { snapshot: 1, streaming: 0 },
    });
    expect(lastDiagnostics.droppedByPolicy).toBeGreaterThan(0);
  });

  it('blockedByGateway count does not appear in sentByState after multiple gateway blocks', async () => {
    // Bootstrap snapshot is armed but all frames are gateway-blocked.
    // Only the first frame passes allowSend() (snapshot); subsequent ones
    // are blocked by the snapshot being consumed on gateway-block... but wait,
    // gateway-blocked frames do NOT consume the snapshot, so all frames
    // will hit allowSend() = true until the snapshot is consumed by a
    // successful dispatch. Since all are blocked, snapshot stays armed.
    const { ctrl, getObserver, store } = createHarness({
      submitDecision: () => ({
        outcome: 'block' as const,
        classification: 'replaceable' as const,
        reason: 'breaker-open',
      }),
    });

    await ctrl.start();
    // Each frame hits the gateway and is blocked
    for (let i = 1; i <= 3; i++) {
      getObserver()!.onFrame(mkFrame(i));
      await Promise.resolve();
    }

    const lastDiagnostics = store.setVisualSendDiagnostics.mock.calls.at(-1)?.[0];
    expect(lastDiagnostics.sentByState.snapshot).toBe(0);
    expect(lastDiagnostics.sentByState.streaming).toBe(0);
    expect(lastDiagnostics.blockedByGateway).toBeGreaterThanOrEqual(1);
  });

  // ── Requirement 4: frame dump is capture-level, does not imply model visibility ──

  it('frame dump persists frames that were NOT sent (policy-gated out)', async () => {
    // The frame dump records captured frames for debugging purposes.
    // It must run even when the policy blocks the send.
    const { ctrl, getObserver, saveScreenFrameDumpFrame } = createHarness({
      saveScreenFramesEnabled: true,
    });

    await ctrl.start();
    // Consume bootstrap snapshot so we're in sleep
    getObserver()!.onFrame(mkFrame(0));
    await Promise.resolve();

    // In sleep – frame is captured but not sent
    const blockedFrame = mkFrame(1);
    getObserver()!.onFrame(blockedFrame);
    await Promise.resolve();

    // Frame dump should have been called even for the blocked frame
    await vi.waitFor(() => {
      expect(saveScreenFrameDumpFrame).toHaveBeenCalledWith(
        expect.objectContaining({ sequence: 1 }),
      );
    });
  });

  // ── Requirement 5: no regression in existing diagnostics behavior ─────────

  it('no regression: capture diagnostics (frameCount) still update from observer', async () => {
    const { ctrl, store, getObserver } = createHarness();

    await ctrl.start();
    getObserver()!.onDiagnostics({ frameCount: 5 });

    expect(store.setScreenCaptureDiagnostics).toHaveBeenCalledWith(
      expect.objectContaining({ frameCount: 5 }),
    );
  });

  it('no regression: sentByState.snapshot increments when a snapshot frame is sent via analyzeScreenNow', async () => {
    // analyzeScreenNow arms a snapshot from sleep. The snapshot-sent
    // counter must increment when that frame reaches the transport.
    const { ctrl, store, getObserver } = createHarness({
      visualSendPolicyOptions: { nowMs: (() => {
        let t = 0;
        return () => { t += 5000; return t; };
      })() },
    });

    await ctrl.start();
    // Consume bootstrap snapshot
    getObserver()!.onFrame(mkFrame(0));
    await Promise.resolve();

    ctrl.analyzeScreenNow(); // arms snapshot from sleep
    getObserver()!.onFrame(mkFrame(1));
    await Promise.resolve();

    const lastCall = store.setVisualSendDiagnostics.mock.calls.at(-1)?.[0];
    // 2 snapshots: 1 bootstrap + 1 explicit
    expect(lastCall.sentByState.snapshot).toBe(2);
  });

  it('no regression: gateway-blocked frame does not change screenCaptureDiagnostics lastUploadStatus to sent', async () => {
    const { ctrl, getObserver, store } = createHarness({
      submitDecision: () => ({
        outcome: 'block' as const,
        classification: 'replaceable' as const,
        reason: 'breaker-open',
      }),
    });

    await ctrl.start();
    getObserver()!.onFrame(mkFrame(1));
    await Promise.resolve();

    const calls = store.setScreenCaptureDiagnostics.mock.calls;
    const sentCalls = calls.filter(([p]) => p.lastUploadStatus === 'sent');
    expect(sentCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Wave 2 – Intelligent local triggers for visual delivery
//
// Tests for:
//   1. Speech trigger (onSpeechStart) fires a snapshot
//   2. Text trigger (onTextSent) fires a snapshot
//   3. Visual change detection triggers burst streaming
//   4. Burst auto-expires after timer
//   5. Burst ends early on stabilization (consecutive non-change frames)
//   6. Burst timer resets on continued visual change
//   7. Explicit analyzeScreenNow/enableStreaming/stopStreaming clear burst state
//   8. Bootstrap snapshot does NOT block subsequent triggers
//   9. Diagnostics reflect triggers and bursts
// ---------------------------------------------------------------------------
describe('createScreenCaptureController – Wave 2 triggers and burst', () => {
  const mkFrame = (seq: number, fill = seq) => ({
    data: new Uint8Array(128).fill(fill),
    mimeType: 'image/jpeg' as const,
    sequence: seq,
    widthPx: 640,
    heightPx: 360,
  });

  // Helper: start controller, consume bootstrap snapshot, and return to sleep
  async function startAndConsumeBootstrap(harness: ReturnType<typeof createHarness>) {
    await harness.ctrl.start();
    harness.getObserver()!.onFrame(mkFrame(0, 100));
    await Promise.resolve();
    harness.sendVideoFrame.mockClear();
  }

  // ── 1. Speech trigger ───────────────────────────────────────────────────

  it('onSpeechStart arms a snapshot when screen share is active and in sleep', async () => {
    let now = 0;
    const harness = createHarness({
      visualSendPolicyOptions: { nowMs: () => now },
    });
    await startAndConsumeBootstrap(harness);

    // Advance past any cooldown
    now += 5000;
    harness.ctrl.onSpeechStart();
    expect(harness.ctrl.getVisualSendState()).toBe('snapshot');

    // Next frame should be sent
    harness.getObserver()!.onFrame(mkFrame(1, 100));
    await Promise.resolve();
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(1);
    // Back to sleep after snapshot consumed
    expect(harness.ctrl.getVisualSendState()).toBe('sleep');
  });

  it('onSpeechStart is no-op when screen share is not active', () => {
    const harness = createHarness();
    // Not started
    harness.ctrl.onSpeechStart();
    expect(harness.ctrl.getVisualSendState()).toBe('inactive');
  });

  // ── 2. Text trigger ────────────────────────────────────────────────────

  it('onTextSent arms a snapshot when screen share is active and in sleep', async () => {
    let now = 0;
    const harness = createHarness({
      visualSendPolicyOptions: { nowMs: () => now },
    });
    await startAndConsumeBootstrap(harness);

    now += 5000;
    harness.ctrl.onTextSent();
    expect(harness.ctrl.getVisualSendState()).toBe('snapshot');

    harness.getObserver()!.onFrame(mkFrame(1, 100));
    await Promise.resolve();
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(1);
    expect(harness.ctrl.getVisualSendState()).toBe('sleep');
  });

  it('onTextSent is no-op when screen share is not active', () => {
    const harness = createHarness();
    harness.ctrl.onTextSent();
    expect(harness.ctrl.getVisualSendState()).toBe('inactive');
  });

  // ── Trigger cooldown ──────────────────────────────────────────────────

  it('triggers respect their own cooldown: second trigger within 2s is ignored', async () => {
    let now = 0;
    const harness = createHarness({
      visualSendPolicyOptions: { nowMs: () => now },
    });
    await startAndConsumeBootstrap(harness);

    now += 5000;
    harness.ctrl.onSpeechStart();
    expect(harness.ctrl.getVisualSendState()).toBe('snapshot');

    // Consume the snapshot
    harness.getObserver()!.onFrame(mkFrame(1, 100));
    await Promise.resolve();
    harness.sendVideoFrame.mockClear();

    // Within cooldown (2s), another trigger should be ignored
    now += 1000;
    harness.ctrl.onTextSent();
    expect(harness.ctrl.getVisualSendState()).toBe('sleep');

    // After cooldown passes, trigger works
    now += 2000;
    harness.ctrl.onTextSent();
    expect(harness.ctrl.getVisualSendState()).toBe('snapshot');
  });

  // ── 3. Visual change detection → burst ────────────────────────────────

  it('visual change in a frame triggers burst streaming from sleep', async () => {
    const harness = createHarness({
      submitDecision: () => ({
        outcome: 'send' as const,
        classification: 'replaceable' as const,
        reason: 'accepted',
      }),
    });
    await startAndConsumeBootstrap(harness);

    // Send a frame with drastically different content to trigger visual change
    harness.getObserver()!.onFrame(mkFrame(1, 250));
    await Promise.resolve();

    expect(harness.ctrl.getVisualSendState()).toBe('streaming');
    // The frame that triggered the burst should be sent
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(1);
  });

  // ── 4. Burst auto-expires after timer ─────────────────────────────────

  it('burst auto-expires after burstDurationMs', async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness({
        burstDurationMs: 100,
        submitDecision: () => ({
          outcome: 'send' as const,
          classification: 'replaceable' as const,
          reason: 'accepted',
        }),
      });
      await startAndConsumeBootstrap(harness);

      // Trigger burst via visual change
      harness.getObserver()!.onFrame(mkFrame(1, 250));
      await Promise.resolve();
      expect(harness.ctrl.getVisualSendState()).toBe('streaming');

      // Advance past burst duration
      vi.advanceTimersByTime(101);
      expect(harness.ctrl.getVisualSendState()).toBe('sleep');
    } finally {
      vi.useRealTimers();
    }
  });

  // ── 5. Burst ends early on stabilization ──────────────────────────────

  it('burst ends early when consecutive non-change frames reach the stabilization threshold', async () => {
    const harness = createHarness({
      burstDurationMs: 60000, // long timer so only stabilization ends it
      burstStableFrames: 2,
      submitDecision: () => ({
        outcome: 'send' as const,
        classification: 'replaceable' as const,
        reason: 'accepted',
      }),
    });
    await startAndConsumeBootstrap(harness);

    // Trigger burst
    harness.getObserver()!.onFrame(mkFrame(1, 250));
    await Promise.resolve();
    expect(harness.ctrl.getVisualSendState()).toBe('streaming');

    // Two consecutive non-change frames (same fill=250 as the last)
    harness.getObserver()!.onFrame(mkFrame(2, 250));
    await Promise.resolve();
    // 1 non-change frame, not enough yet
    expect(harness.ctrl.getVisualSendState()).toBe('streaming');

    harness.getObserver()!.onFrame(mkFrame(3, 250));
    await Promise.resolve();
    // 2 consecutive non-change frames → stabilization → back to sleep
    expect(harness.ctrl.getVisualSendState()).toBe('sleep');
  });

  // ── 6. Burst timer resets on continued visual change ──────────────────

  it('burst timer resets when visual changes continue during an active burst', async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness({
        burstDurationMs: 100,
        submitDecision: () => ({
          outcome: 'send' as const,
          classification: 'replaceable' as const,
          reason: 'accepted',
        }),
      });
      await startAndConsumeBootstrap(harness);

      // Start burst
      harness.getObserver()!.onFrame(mkFrame(1, 250));
      await Promise.resolve();
      expect(harness.ctrl.getVisualSendState()).toBe('streaming');

      // Advance 80ms (within burst window)
      vi.advanceTimersByTime(80);
      expect(harness.ctrl.getVisualSendState()).toBe('streaming');

      // Another visual change resets the timer
      harness.getObserver()!.onFrame(mkFrame(2, 50));
      await Promise.resolve();
      expect(harness.ctrl.getVisualSendState()).toBe('streaming');

      // Advance another 80ms — would have expired under original timer, but not after reset
      vi.advanceTimersByTime(80);
      expect(harness.ctrl.getVisualSendState()).toBe('streaming');

      // Now advance past full burst duration from last reset
      vi.advanceTimersByTime(50);
      expect(harness.ctrl.getVisualSendState()).toBe('sleep');
    } finally {
      vi.useRealTimers();
    }
  });

  // ── 7. Explicit controls clear burst state ────────────────────────────

  it('analyzeScreenNow clears an active burst', async () => {
    let now = 0;
    const harness = createHarness({
      burstDurationMs: 60000,
      visualSendPolicyOptions: { nowMs: () => now },
      submitDecision: () => ({
        outcome: 'send' as const,
        classification: 'replaceable' as const,
        reason: 'accepted',
      }),
    });
    await startAndConsumeBootstrap(harness);
    now += 5000;

    // Start burst
    harness.getObserver()!.onFrame(mkFrame(1, 250));
    await Promise.resolve();
    expect(harness.ctrl.getVisualSendState()).toBe('streaming');

    // analyzeScreenNow clears burst and arms snapshot
    harness.ctrl.analyzeScreenNow();
    expect(harness.ctrl.getVisualSendState()).toBe('snapshot');
  });

  it('enableStreaming clears an active burst and enters explicit streaming', async () => {
    const harness = createHarness({
      burstDurationMs: 60000,
      submitDecision: () => ({
        outcome: 'send' as const,
        classification: 'replaceable' as const,
        reason: 'accepted',
      }),
    });
    await startAndConsumeBootstrap(harness);

    // Start burst
    harness.getObserver()!.onFrame(mkFrame(1, 250));
    await Promise.resolve();
    expect(harness.ctrl.getVisualSendState()).toBe('streaming');

    // enableStreaming overrides burst — still streaming but burst is cleared
    harness.ctrl.enableStreaming();
    expect(harness.ctrl.getVisualSendState()).toBe('streaming');

    // Verify burst is cleared: non-change frames should NOT trigger stabilization
    harness.getObserver()!.onFrame(mkFrame(2, 250));
    await Promise.resolve();
    harness.getObserver()!.onFrame(mkFrame(3, 250));
    await Promise.resolve();
    // Still streaming (explicit, not burst — no stabilization cutoff)
    expect(harness.ctrl.getVisualSendState()).toBe('streaming');
  });

  it('stopStreaming clears an active burst and returns to sleep', async () => {
    const harness = createHarness({
      burstDurationMs: 60000,
      submitDecision: () => ({
        outcome: 'send' as const,
        classification: 'replaceable' as const,
        reason: 'accepted',
      }),
    });
    await startAndConsumeBootstrap(harness);

    // Start burst
    harness.getObserver()!.onFrame(mkFrame(1, 250));
    await Promise.resolve();
    expect(harness.ctrl.getVisualSendState()).toBe('streaming');

    harness.ctrl.stopStreaming();
    expect(harness.ctrl.getVisualSendState()).toBe('sleep');
  });

  // ── 8. Bootstrap does NOT block triggers ──────────────────────────────

  it('speech trigger works immediately after bootstrap snapshot (no cooldown set by bootstrap)', async () => {
    const now = 0;
    const harness = createHarness({
      visualSendPolicyOptions: { nowMs: () => now },
      submitDecision: () => ({
        outcome: 'send' as const,
        classification: 'replaceable' as const,
        reason: 'accepted',
      }),
    });
    await harness.ctrl.start();

    // Consume bootstrap
    harness.getObserver()!.onFrame(mkFrame(0, 100));
    await Promise.resolve();
    harness.sendVideoFrame.mockClear();

    // Immediately trigger speech (no time advance needed — bootstrap sets no cooldown)
    harness.ctrl.onSpeechStart();
    expect(harness.ctrl.getVisualSendState()).toBe('snapshot');
  });

  it('analyzeScreenNow works immediately after bootstrap (no cooldown set by bootstrap)', async () => {
    const now = 0;
    const harness = createHarness({
      visualSendPolicyOptions: { nowMs: () => now },
      submitDecision: () => ({
        outcome: 'send' as const,
        classification: 'replaceable' as const,
        reason: 'accepted',
      }),
    });
    await harness.ctrl.start();

    // Consume bootstrap
    harness.getObserver()!.onFrame(mkFrame(0, 100));
    await Promise.resolve();
    harness.sendVideoFrame.mockClear();

    // analyzeScreenNow should work immediately (bootstrap set no cooldown)
    harness.ctrl.analyzeScreenNow();
    expect(harness.ctrl.getVisualSendState()).toBe('snapshot');
  });

  // ── 9. Diagnostics reflect triggers and bursts ────────────────────────

  it('diagnostics include triggerSnapshotCount after speech/text triggers', async () => {
    let now = 0;
    const harness = createHarness({
      visualSendPolicyOptions: { nowMs: () => now },
      submitDecision: () => ({
        outcome: 'send' as const,
        classification: 'replaceable' as const,
        reason: 'accepted',
      }),
    });
    await startAndConsumeBootstrap(harness);

    // Trigger 1
    now += 5000;
    harness.ctrl.onSpeechStart();
    harness.getObserver()!.onFrame(mkFrame(1, 100));
    await Promise.resolve();

    // Trigger 2
    now += 5000;
    harness.ctrl.onTextSent();
    harness.getObserver()!.onFrame(mkFrame(2, 100));
    await Promise.resolve();

    const lastDiag = harness.store.setVisualSendDiagnostics.mock.calls.at(-1)?.[0];
    expect(lastDiag.triggerSnapshotCount).toBe(2);
  });

  it('diagnostics include burstCount after visual change triggers burst', async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness({
        burstDurationMs: 100,
        burstReentryCooldownMs: 0,
        submitDecision: () => ({
          outcome: 'send' as const,
          classification: 'replaceable' as const,
          reason: 'accepted',
        }),
      });
      await startAndConsumeBootstrap(harness);

      // Trigger burst via visual change
      harness.getObserver()!.onFrame(mkFrame(1, 250));
      await Promise.resolve();

      let diag = harness.store.setVisualSendDiagnostics.mock.calls.at(-1)?.[0];
      expect(diag.burstCount).toBe(1);

      // Let burst expire, then trigger another
      vi.advanceTimersByTime(101);
      harness.getObserver()!.onFrame(mkFrame(2, 50));
      await Promise.resolve();

      diag = harness.store.setVisualSendDiagnostics.mock.calls.at(-1)?.[0];
      expect(diag.burstCount).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  // ── Stop clears burst state ───────────────────────────────────────────

  it('stopping screen share clears burst state and resets visual change detector', async () => {
    const harness = createHarness({
      burstDurationMs: 60000,
      submitDecision: () => ({
        outcome: 'send' as const,
        classification: 'replaceable' as const,
        reason: 'accepted',
      }),
    });
    await startAndConsumeBootstrap(harness);

    // Start burst
    harness.getObserver()!.onFrame(mkFrame(1, 250));
    await Promise.resolve();
    expect(harness.ctrl.getVisualSendState()).toBe('streaming');

    await harness.ctrl.stop();
    expect(harness.ctrl.getVisualSendState()).toBe('inactive');

    // Restart — should be clean state (no leftover burst)
    await harness.ctrl.start();
    expect(harness.ctrl.getVisualSendState()).toBe('snapshot');
  });

  // ── Exported constants ────────────────────────────────────────────────

  it('exports expected burst constants', () => {
    expect(VISUAL_BURST_DURATION_MS).toBe(5000);
    expect(VISUAL_BURST_STABLE_FRAMES).toBe(3);
    expect(VISUAL_BURST_SEND_COOLDOWN_MS).toBe(1000);
    expect(VISUAL_BURST_MAX_FRAMES).toBe(5);
    expect(VISUAL_BURST_MAX_LIFETIME_MS).toBe(15_000);
    expect(VISUAL_BURST_REENTRY_COOLDOWN_MS).toBe(3_000);
  });
});

// ---------------------------------------------------------------------------
// Wave 3 – Burst gating, throttling, and stabilization refinement
//
// Tests for:
//   A. Pre-send visual gate: near-duplicate frames suppressed during burst
//   B. Burst send throttle: minimum interval between burst sends
//   C. Decay-based stabilization: noise frames slow but don't prevent shutdown
//   D. Non-burst sends are unaffected by gate/throttle
// ---------------------------------------------------------------------------
describe('createScreenCaptureController – Wave 3 burst efficiency', () => {
  const mkFrame = (seq: number, fill = seq) => ({
    data: new Uint8Array(128).fill(fill),
    mimeType: 'image/jpeg' as const,
    sequence: seq,
    widthPx: 640,
    heightPx: 360,
  });

  async function startAndConsumeBootstrap(harness: ReturnType<typeof createHarness>) {
    await harness.ctrl.start();
    harness.getObserver()!.onFrame(mkFrame(0, 100));
    await Promise.resolve();
    harness.sendVideoFrame.mockClear();
  }

  const alwaysSend = (): RealtimeOutboundDecision => ({
    outcome: 'send' as const,
    classification: 'replaceable' as const,
    reason: 'accepted',
  });

  // ── A. Pre-send visual gate ─────────────────────────────────────────────

  it('burst send gate suppresses near-duplicate frames during burst', async () => {
    let now = 0;
    const harness = createHarness({
      burstDurationMs: 60000,
      burstSendCooldownMs: 0, // disable throttle to isolate gate behavior
      visualSendPolicyOptions: { nowMs: () => now },
      submitDecision: alwaysSend,
    });
    await startAndConsumeBootstrap(harness);
    now += 5000;

    // Trigger burst with a changed frame (fill=250 vs baseline fill=100)
    harness.getObserver()!.onFrame(mkFrame(1, 250));
    await Promise.resolve();
    expect(harness.ctrl.getVisualSendState()).toBe('streaming');
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(1);

    // Send identical frame — should be suppressed by visual gate
    harness.getObserver()!.onFrame(mkFrame(2, 250));
    await Promise.resolve();
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(1);

    // Send a different frame — should pass the gate
    harness.getObserver()!.onFrame(mkFrame(3, 50));
    await Promise.resolve();
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(2);
  });

  // ── B. Burst send throttle ──────────────────────────────────────────────

  it('burst send throttle enforces minimum interval between burst sends', async () => {
    let now = 0;
    const harness = createHarness({
      burstDurationMs: 60000,
      burstSendCooldownMs: 1000,
      visualSendPolicyOptions: { nowMs: () => now },
      submitDecision: alwaysSend,
    });
    await startAndConsumeBootstrap(harness);
    now += 5000;

    // Trigger burst
    harness.getObserver()!.onFrame(mkFrame(1, 250));
    await Promise.resolve();
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(1);

    // Within cooldown (500ms later) — different frame but throttled
    now += 500;
    harness.getObserver()!.onFrame(mkFrame(2, 50));
    await Promise.resolve();
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(1);

    // After cooldown (1100ms from first send) — should pass
    now += 600;
    harness.getObserver()!.onFrame(mkFrame(3, 150));
    await Promise.resolve();
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(2);
  });

  it('first frame in burst always bypasses throttle cooldown', async () => {
    let now = 0;
    const harness = createHarness({
      burstDurationMs: 100,
      burstSendCooldownMs: 5000, // very long cooldown
      burstReentryCooldownMs: 0,
      visualSendPolicyOptions: { nowMs: () => now },
      submitDecision: alwaysSend,
    });
    await startAndConsumeBootstrap(harness);
    now += 5000;

    vi.useFakeTimers();
    try {
      // Trigger first burst — first frame should always send
      harness.getObserver()!.onFrame(mkFrame(1, 250));
      await Promise.resolve();
      expect(harness.sendVideoFrame).toHaveBeenCalledTimes(1);

      // Let burst expire
      vi.advanceTimersByTime(101);

      // Start second burst — first frame should bypass cooldown
      now += 200; // only 200ms since last send
      harness.getObserver()!.onFrame(mkFrame(2, 50));
      await Promise.resolve();
      expect(harness.sendVideoFrame).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  // ── C. Decay-based stabilization ────────────────────────────────────────

  it('stabilization uses decay: noise frame reduces counter instead of resetting', async () => {
    const harness = createHarness({
      burstDurationMs: 60000,
      burstStableFrames: 3,
      burstSendCooldownMs: 0,
      submitDecision: alwaysSend,
    });
    await startAndConsumeBootstrap(harness);

    // Start burst
    harness.getObserver()!.onFrame(mkFrame(1, 250));
    await Promise.resolve();
    expect(harness.ctrl.getVisualSendState()).toBe('streaming');

    // 2 non-change frames: count → 2
    harness.getObserver()!.onFrame(mkFrame(2, 250));
    await Promise.resolve();
    harness.getObserver()!.onFrame(mkFrame(3, 250));
    await Promise.resolve();
    expect(harness.ctrl.getVisualSendState()).toBe('streaming'); // not yet at 3

    // 1 change frame (noise): count → max(0, 2-1) = 1
    harness.getObserver()!.onFrame(mkFrame(4, 50));
    await Promise.resolve();
    expect(harness.ctrl.getVisualSendState()).toBe('streaming');

    // 2 more non-change frames: count → 2, then 3 → stabilized
    harness.getObserver()!.onFrame(mkFrame(5, 50));
    await Promise.resolve();
    expect(harness.ctrl.getVisualSendState()).toBe('streaming'); // count=2

    harness.getObserver()!.onFrame(mkFrame(6, 50));
    await Promise.resolve();
    expect(harness.ctrl.getVisualSendState()).toBe('sleep'); // count=3 → done
  });

  // ── D. Non-burst sends unaffected ──────────────────────────────────────

  it('explicit streaming is not affected by burst send gate or throttle', async () => {
    const now = 0;
    const harness = createHarness({
      burstSendCooldownMs: 60000, // extreme cooldown
      visualSendPolicyOptions: { nowMs: () => now },
      submitDecision: (i) => ({
        outcome: i <= 5 ? 'send' as const : 'replace' as const,
        classification: 'replaceable' as const,
        reason: i <= 5 ? 'accepted' : 'superseded-latest',
      }),
    });
    await startAndConsumeBootstrap(harness);

    harness.ctrl.enableStreaming();

    // Send identical frames rapidly — all should pass (not burst, so no gate/throttle)
    harness.getObserver()!.onFrame(mkFrame(1, 100));
    await Promise.resolve();
    harness.getObserver()!.onFrame(mkFrame(2, 100));
    await Promise.resolve();
    harness.getObserver()!.onFrame(mkFrame(3, 100));
    await Promise.resolve();

    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(3);
  });

  it('snapshot sends are not affected by burst send gate or throttle', async () => {
    let now = 0;
    const harness = createHarness({
      burstSendCooldownMs: 60000,
      visualSendPolicyOptions: { nowMs: () => now },
      submitDecision: alwaysSend,
    });
    await startAndConsumeBootstrap(harness);

    // Explicit analyzeScreenNow arms snapshot — should send regardless of throttle
    now += 5000;
    harness.ctrl.analyzeScreenNow();
    harness.getObserver()!.onFrame(mkFrame(1, 100));
    await Promise.resolve();
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(1);
  });

  // ── Burst gate resets between bursts ───────────────────────────────────

  it('burst send gate resets when burst ends', async () => {
    vi.useFakeTimers();
    try {
      let now = 0;
      const harness = createHarness({
        burstDurationMs: 100,
        burstSendCooldownMs: 0,
        burstReentryCooldownMs: 0,
        visualSendPolicyOptions: { nowMs: () => now },
        submitDecision: alwaysSend,
      });
      await startAndConsumeBootstrap(harness);
      now += 5000;

      // First burst: send frame with fill=250
      harness.getObserver()!.onFrame(mkFrame(1, 250));
      await Promise.resolve();
      expect(harness.sendVideoFrame).toHaveBeenCalledTimes(1);

      // Let burst expire
      vi.advanceTimersByTime(101);
      expect(harness.ctrl.getVisualSendState()).toBe('sleep');

      // Second burst: use a different fill to trigger visual change detection
      // (change detector baseline is fill=250 from first burst).
      // The burst send gate was reset, so the first frame of the new burst sends.
      harness.getObserver()!.onFrame(mkFrame(2, 50));
      await Promise.resolve();
      expect(harness.sendVideoFrame).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  // ── droppedByPolicy counts gated/throttled frames ─────────────────────

  it('frames suppressed by burst gate/throttle increment droppedByPolicy', async () => {
    let now = 0;
    const harness = createHarness({
      burstDurationMs: 60000,
      burstSendCooldownMs: 0,
      visualSendPolicyOptions: { nowMs: () => now },
      submitDecision: alwaysSend,
    });
    await startAndConsumeBootstrap(harness);
    now += 5000;

    // Trigger burst
    harness.getObserver()!.onFrame(mkFrame(1, 250));
    await Promise.resolve();

    // Same frame — gated, should count as droppedByPolicy
    harness.getObserver()!.onFrame(mkFrame(2, 250));
    await Promise.resolve();

    const lastDiag = harness.store.setVisualSendDiagnostics.mock.calls.at(-1)?.[0];
    expect(lastDiag.droppedByPolicy).toBeGreaterThan(0);
  });
});

describe('createScreenCaptureController – Wave 4 adaptive quality', () => {
  const alwaysSend = (): RealtimeOutboundDecision => ({
    outcome: 'send',
    classification: 'replaceable',
    reason: 'accepted',
  });

  const LOW_PARAMS = getScreenCaptureQualityParams('Low');
  const MEDIUM_PARAMS = getScreenCaptureQualityParams('Medium');
  const HIGH_PARAMS = getScreenCaptureQualityParams('High');

  async function startCapture(harness: ReturnType<typeof createHarness>): Promise<void> {
    await harness.ctrl.start();
    // Consume the bootstrap snapshot send
    harness.getObserver()!.onFrame({
      data: new Uint8Array([1, 2, 3]),
      mimeType: 'image/jpeg',
      sequence: 1,
      widthPx: 640,
      heightPx: 360,
    });
    await Promise.resolve();
  }

  it('exports the promotion duration constant', () => {
    expect(QUALITY_PROMOTION_DURATION_MS).toBe(10_000);
  });

  it('passes baseline quality params to capture.start when baseline is Low', async () => {
    const harness = createHarness({
      getBaselineQuality: () => 'Low',
      submitDecision: alwaysSend,
    });
    await harness.ctrl.start();
    expect(harness.mockCapture.start).toHaveBeenCalledTimes(1);
    // capture.start() is called before onScreenShareStarted fires, so params are baseline
    const startArgs = harness.mockCapture.start.mock.calls[0]?.[0];
    if (!startArgs) {
      throw new Error('Expected capture.start to receive quality parameters');
    }
    expect(startArgs.jpegQuality).toBe(LOW_PARAMS.jpegQuality);
    expect(startArgs.maxWidthPx).toBe(LOW_PARAMS.maxWidthPx);
    // Then promotion happens via onScreenShareStarted → promoteQuality → updateQuality
    expect(harness.mockCapture.updateQuality).toHaveBeenCalledWith(HIGH_PARAMS);
  });

  it('passes baseline quality params to capture.start when baseline is High (no promotion)', async () => {
    const harness = createHarness({
      getBaselineQuality: () => 'High',
      submitDecision: alwaysSend,
    });
    await harness.ctrl.start();
    expect(harness.mockCapture.start).toHaveBeenCalledTimes(1);
    const startArgs = harness.mockCapture.start.mock.calls[0]?.[0];
    if (!startArgs) {
      throw new Error('Expected capture.start to receive quality parameters');
    }
    // High baseline — promotion is no-op, still High
    expect(startArgs.jpegQuality).toBe(HIGH_PARAMS.jpegQuality);
    expect(startArgs.maxWidthPx).toBe(HIGH_PARAMS.maxWidthPx);
  });

  it('promotes quality on bootstrap and calls updateQuality', async () => {
    const harness = createHarness({
      getBaselineQuality: () => 'Low',
      submitDecision: alwaysSend,
    });
    await harness.ctrl.start();
    // Bootstrap triggers promote → updateQuality should be called with High params
    expect(harness.mockCapture.updateQuality).toHaveBeenCalledWith(HIGH_PARAMS);
  });

  it('does not call updateQuality on bootstrap when baseline is High', async () => {
    const harness = createHarness({
      getBaselineQuality: () => 'High',
      submitDecision: alwaysSend,
    });
    await harness.ctrl.start();
    // High baseline — promote() is no-op, updateQuality never called
    expect(harness.mockCapture.updateQuality).not.toHaveBeenCalled();
  });

  it('promotes quality on analyzeScreenNow and calls updateQuality', async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness({
        getBaselineQuality: () => 'Medium',
        promotionDurationMs: 50000,
        submitDecision: alwaysSend,
      });
      await startCapture(harness);

      // Clear the bootstrap promotion call
      harness.mockCapture.updateQuality.mockClear();

      // Let bootstrap promotion expire
      vi.advanceTimersByTime(50000);

      // updateQuality called with baseline params on expiry
      expect(harness.mockCapture.updateQuality).toHaveBeenCalledWith(MEDIUM_PARAMS);
      harness.mockCapture.updateQuality.mockClear();

      harness.ctrl.analyzeScreenNow();
      expect(harness.mockCapture.updateQuality).toHaveBeenCalledWith(HIGH_PARAMS);
    } finally {
      vi.useRealTimers();
    }
  });

  it('promotes quality on onSpeechStart and calls updateQuality', async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness({
        getBaselineQuality: () => 'Low',
        promotionDurationMs: 50000,
        submitDecision: alwaysSend,
      });
      await startCapture(harness);
      harness.mockCapture.updateQuality.mockClear();

      // Let bootstrap promotion expire
      vi.advanceTimersByTime(50000);
      harness.mockCapture.updateQuality.mockClear();

      harness.ctrl.onSpeechStart();
      expect(harness.mockCapture.updateQuality).toHaveBeenCalledWith(HIGH_PARAMS);
    } finally {
      vi.useRealTimers();
    }
  });

  it('promotes quality on onTextSent and calls updateQuality', async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness({
        getBaselineQuality: () => 'Low',
        promotionDurationMs: 50000,
        submitDecision: alwaysSend,
      });
      await startCapture(harness);
      harness.mockCapture.updateQuality.mockClear();

      // Let bootstrap promotion expire
      vi.advanceTimersByTime(50000);
      harness.mockCapture.updateQuality.mockClear();

      harness.ctrl.onTextSent();
      expect(harness.mockCapture.updateQuality).toHaveBeenCalledWith(HIGH_PARAMS);
    } finally {
      vi.useRealTimers();
    }
  });

  it('promotion auto-expires and returns to baseline quality', async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness({
        getBaselineQuality: () => 'Medium',
        promotionDurationMs: 5000,
        submitDecision: alwaysSend,
      });
      await startCapture(harness);
      // Bootstrap promoted → updateQuality(HIGH) already called
      harness.mockCapture.updateQuality.mockClear();

      // Advance past promotion expiry
      vi.advanceTimersByTime(5000);

      // Should revert to baseline
      expect(harness.mockCapture.updateQuality).toHaveBeenCalledWith(MEDIUM_PARAMS);
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-promotion resets the expiry timer', async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness({
        getBaselineQuality: () => 'Low',
        promotionDurationMs: 5000,
        submitDecision: alwaysSend,
      });
      await startCapture(harness);
      harness.mockCapture.updateQuality.mockClear();

      // Advance halfway
      vi.advanceTimersByTime(3000);

      // Re-promote via speech
      harness.ctrl.onSpeechStart();
      // Should not have called updateQuality again (already promoted)
      expect(harness.mockCapture.updateQuality).not.toHaveBeenCalled();

      // Advance another 3s — original timer would have fired, but reset didn't
      vi.advanceTimersByTime(3000);
      expect(harness.mockCapture.updateQuality).not.toHaveBeenCalled();

      // Full duration from re-promotion
      vi.advanceTimersByTime(2000);
      expect(harness.mockCapture.updateQuality).toHaveBeenCalledWith(LOW_PARAMS);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stopStreaming returns to baseline quality when promoted', async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness({
        getBaselineQuality: () => 'Low',
        promotionDurationMs: 50000,
        submitDecision: alwaysSend,
      });
      await startCapture(harness);
      harness.mockCapture.updateQuality.mockClear();

      harness.ctrl.enableStreaming();
      harness.ctrl.stopStreaming();

      // Should revert to baseline
      expect(harness.mockCapture.updateQuality).toHaveBeenCalledWith(LOW_PARAMS);

      // Promotion timer should have been cleared — advancing time should not fire it
      vi.advanceTimersByTime(50000);
      // Only the one call from stopStreaming
      expect(harness.mockCapture.updateQuality).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('start() reinitializes quality policy with fresh baseline', async () => {
    vi.useFakeTimers();
    try {
      let baseline: VisualSessionQuality = 'Low';
      const harness = createHarness({
        getBaselineQuality: () => baseline,
        promotionDurationMs: 5000,
        submitDecision: alwaysSend,
      });

      // First session with Low baseline
      await startCapture(harness);
      harness.mockCapture.updateQuality.mockClear();
      vi.advanceTimersByTime(5000);
      expect(harness.mockCapture.updateQuality).toHaveBeenCalledWith(LOW_PARAMS);

      // Stop screen share
      await harness.ctrl.stop();
      harness.setScreenState('disabled');
      harness.mockCapture.updateQuality.mockClear();
      harness.mockCapture.start.mockClear();

      // Change baseline to Medium
      baseline = 'Medium';
      await startCapture(harness);
      harness.mockCapture.updateQuality.mockClear();
      vi.advanceTimersByTime(5000);
      // Should revert to Medium, not Low
      expect(harness.mockCapture.updateQuality).toHaveBeenCalledWith(MEDIUM_PARAMS);
    } finally {
      vi.useRealTimers();
    }
  });

  it('High baseline makes all promotions no-ops', async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness({
        getBaselineQuality: () => 'High',
        promotionDurationMs: 5000,
        submitDecision: alwaysSend,
      });
      await startCapture(harness);

      // No updateQuality calls at all — baseline is already High
      expect(harness.mockCapture.updateQuality).not.toHaveBeenCalled();

      harness.ctrl.analyzeScreenNow();
      expect(harness.mockCapture.updateQuality).not.toHaveBeenCalled();

      harness.ctrl.onSpeechStart();
      expect(harness.mockCapture.updateQuality).not.toHaveBeenCalled();

      harness.ctrl.onTextSent();
      expect(harness.mockCapture.updateQuality).not.toHaveBeenCalled();

      vi.advanceTimersByTime(5000);
      expect(harness.mockCapture.updateQuality).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('quality resets on screen share stop', async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness({
        getBaselineQuality: () => 'Low',
        promotionDurationMs: 50000,
        submitDecision: alwaysSend,
      });
      await startCapture(harness);
      harness.mockCapture.updateQuality.mockClear();

      // Stop screen share (which calls onScreenShareStopped → resetQualityState)
      await harness.ctrl.stop();

      // Advancing time should not trigger the promotion timer callback
      vi.advanceTimersByTime(50000);
      expect(harness.mockCapture.updateQuality).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// Wave 6 – Hard burst budgets and passive re-entry control
//
// Tests for:
//   A. Hard frame budget per burst
//   B. Absolute burst lifetime cap under sustained motion
//   C. Re-entry cooldown between passive bursts
//   D. Explicit Analyze screen now bypasses passive burst limits
//   E. Screen-share restart resets the passive re-entry cooldown
// ---------------------------------------------------------------------------
describe('createScreenCaptureController – Wave 6 burst budgets', () => {
  const mkFrame = (seq: number, fill = seq) => ({
    data: new Uint8Array(128).fill(fill),
    mimeType: 'image/jpeg' as const,
    sequence: seq,
    widthPx: 640,
    heightPx: 360,
  });

  async function startAndConsumeBootstrap(
    harness: ReturnType<typeof createHarness>,
  ): Promise<void> {
    await harness.ctrl.start();
    harness.getObserver()!.onFrame(mkFrame(0, 100));
    await Promise.resolve();
    harness.sendVideoFrame.mockClear();
  }

  const alwaysSend = (): RealtimeOutboundDecision => ({
    outcome: 'send',
    classification: 'replaceable',
    reason: 'accepted',
  });

  it('ends a burst once the hard frame budget is exhausted', async () => {
    let now = 0;
    const harness = createHarness({
      burstDurationMs: 60_000,
      burstSendCooldownMs: 0,
      burstMaxFrames: 2,
      visualSendPolicyOptions: { nowMs: () => now },
      submitDecision: alwaysSend,
    });
    await startAndConsumeBootstrap(harness);
    now += 5_000;

    harness.getObserver()!.onFrame(mkFrame(1, 250));
    await Promise.resolve();
    harness.getObserver()!.onFrame(mkFrame(2, 50));
    await Promise.resolve();

    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(2);
    expect(harness.ctrl.getVisualSendState()).toBe('sleep');

    harness.getObserver()!.onFrame(mkFrame(3, 150));
    await Promise.resolve();

    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(2);
    expect(harness.ctrl.getVisualSendState()).toBe('sleep');
  });

  it('Analyze screen now still works after a burst hits the hard frame budget', async () => {
    let now = 0;
    const harness = createHarness({
      burstDurationMs: 60_000,
      burstSendCooldownMs: 0,
      burstMaxFrames: 1,
      visualSendPolicyOptions: { nowMs: () => now },
      submitDecision: alwaysSend,
    });
    await startAndConsumeBootstrap(harness);
    now += 5_000;

    harness.getObserver()!.onFrame(mkFrame(1, 250));
    await Promise.resolve();
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(1);

    harness.getObserver()!.onFrame(mkFrame(2, 50));
    await Promise.resolve();
    expect(harness.ctrl.getVisualSendState()).toBe('sleep');
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(1);

    harness.ctrl.analyzeScreenNow();
    harness.getObserver()!.onFrame(mkFrame(3, 50));
    await Promise.resolve();

    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(2);
    expect(harness.ctrl.getVisualSendState()).toBe('sleep');
  });

  it('enforces the absolute burst lifetime even if motion keeps resetting the soft timer', async () => {
    let now = 0;
    const harness = createHarness({
      burstDurationMs: 60_000,
      burstSendCooldownMs: 0,
      burstMaxLifetimeMs: 1_000,
      visualSendPolicyOptions: { nowMs: () => now },
      submitDecision: alwaysSend,
    });
    await startAndConsumeBootstrap(harness);
    now += 5_000;

    harness.getObserver()!.onFrame(mkFrame(1, 250));
    await Promise.resolve();
    now += 400;
    harness.getObserver()!.onFrame(mkFrame(2, 50));
    await Promise.resolve();
    now += 400;
    harness.getObserver()!.onFrame(mkFrame(3, 200));
    await Promise.resolve();

    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(3);
    expect(harness.ctrl.getVisualSendState()).toBe('streaming');

    now += 300;
    harness.getObserver()!.onFrame(mkFrame(4, 20));
    await Promise.resolve();

    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(3);
    expect(harness.ctrl.getVisualSendState()).toBe('sleep');
  });

  it('blocks passive burst re-entry during cooldown, then allows it again after cooldown', async () => {
    vi.useFakeTimers();
    try {
      let now = 0;
      const harness = createHarness({
        burstDurationMs: 100,
        burstSendCooldownMs: 0,
        burstReentryCooldownMs: 3_000,
        visualSendPolicyOptions: { nowMs: () => now },
        submitDecision: alwaysSend,
      });
      await startAndConsumeBootstrap(harness);
      now += 5_000;

      harness.getObserver()!.onFrame(mkFrame(1, 250));
      await Promise.resolve();
      expect(harness.sendVideoFrame).toHaveBeenCalledTimes(1);
      expect(harness.ctrl.getVisualSendState()).toBe('streaming');

      vi.advanceTimersByTime(101);
      expect(harness.ctrl.getVisualSendState()).toBe('sleep');

      now += 1_000;
      harness.getObserver()!.onFrame(mkFrame(2, 50));
      await Promise.resolve();
      expect(harness.sendVideoFrame).toHaveBeenCalledTimes(1);
      expect(harness.ctrl.getVisualSendState()).toBe('sleep');

      now += 2_000;
      harness.getObserver()!.onFrame(mkFrame(3, 150));
      await Promise.resolve();
      expect(harness.sendVideoFrame).toHaveBeenCalledTimes(2);
      expect(harness.ctrl.getVisualSendState()).toBe('streaming');
    } finally {
      vi.useRealTimers();
    }
  });

  it('Analyze screen now clearing an active burst does not arm passive re-entry cooldown', async () => {
    let now = 0;
    const harness = createHarness({
      burstDurationMs: 60_000,
      burstSendCooldownMs: 0,
      burstReentryCooldownMs: 10_000,
      visualSendPolicyOptions: { nowMs: () => now },
      submitDecision: alwaysSend,
    });
    await startAndConsumeBootstrap(harness);
    now += 5_000;

    harness.getObserver()!.onFrame(mkFrame(1, 250));
    await Promise.resolve();
    expect(harness.ctrl.getVisualSendState()).toBe('streaming');
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(1);

    harness.ctrl.analyzeScreenNow();
    harness.getObserver()!.onFrame(mkFrame(2, 50));
    await Promise.resolve();
    expect(harness.ctrl.getVisualSendState()).toBe('sleep');
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(2);

    harness.getObserver()!.onFrame(mkFrame(3, 150));
    await Promise.resolve();
    expect(harness.ctrl.getVisualSendState()).toBe('streaming');
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(3);
  });

  it('speech-trigger snapshots are not starved by an active passive burst', async () => {
    let now = 0;
    const harness = createHarness({
      burstDurationMs: 60_000,
      burstSendCooldownMs: 0,
      burstReentryCooldownMs: 10_000,
      visualSendPolicyOptions: { nowMs: () => now },
      submitDecision: alwaysSend,
    });
    await startAndConsumeBootstrap(harness);
    now += 5_000;

    harness.getObserver()!.onFrame(mkFrame(1, 250));
    await Promise.resolve();
    expect(harness.ctrl.getVisualSendState()).toBe('streaming');
    harness.sendVideoFrame.mockClear();

    now += 5_000;
    harness.ctrl.onSpeechStart();
    expect(harness.ctrl.getVisualSendState()).toBe('snapshot');

    harness.getObserver()!.onFrame(mkFrame(2, 50));
    await Promise.resolve();
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(1);
    expect(harness.ctrl.getVisualSendState()).toBe('sleep');

    harness.getObserver()!.onFrame(mkFrame(3, 150));
    await Promise.resolve();
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(2);
    expect(harness.ctrl.getVisualSendState()).toBe('streaming');
  });

  it('text-trigger snapshots are not starved by an active passive burst', async () => {
    let now = 0;
    const harness = createHarness({
      burstDurationMs: 60_000,
      burstSendCooldownMs: 0,
      burstReentryCooldownMs: 10_000,
      visualSendPolicyOptions: { nowMs: () => now },
      submitDecision: alwaysSend,
    });
    await startAndConsumeBootstrap(harness);
    now += 5_000;

    harness.getObserver()!.onFrame(mkFrame(1, 250));
    await Promise.resolve();
    expect(harness.ctrl.getVisualSendState()).toBe('streaming');
    harness.sendVideoFrame.mockClear();

    now += 5_000;
    harness.ctrl.onTextSent();
    expect(harness.ctrl.getVisualSendState()).toBe('snapshot');

    harness.getObserver()!.onFrame(mkFrame(2, 50));
    await Promise.resolve();
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(1);
    expect(harness.ctrl.getVisualSendState()).toBe('sleep');

    harness.getObserver()!.onFrame(mkFrame(3, 150));
    await Promise.resolve();
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(2);
    expect(harness.ctrl.getVisualSendState()).toBe('streaming');
  });

  it('screen-share stop resets the passive burst re-entry cooldown', async () => {
    vi.useFakeTimers();
    try {
      let now = 0;
      const harness = createHarness({
        burstDurationMs: 100,
        burstSendCooldownMs: 0,
        burstReentryCooldownMs: 10_000,
        visualSendPolicyOptions: { nowMs: () => now },
        submitDecision: alwaysSend,
      });
      await startAndConsumeBootstrap(harness);
      now += 5_000;

      harness.getObserver()!.onFrame(mkFrame(1, 250));
      await Promise.resolve();
      expect(harness.sendVideoFrame).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(101);
      expect(harness.ctrl.getVisualSendState()).toBe('sleep');

      now += 1_000;
      await harness.ctrl.stop();

      await startAndConsumeBootstrap(harness);
      harness.getObserver()!.onFrame(mkFrame(1, 250));
      await Promise.resolve();

      expect(harness.sendVideoFrame).toHaveBeenCalledTimes(1);
      expect(harness.ctrl.getVisualSendState()).toBe('streaming');
    } finally {
      vi.useRealTimers();
    }
  });
});
