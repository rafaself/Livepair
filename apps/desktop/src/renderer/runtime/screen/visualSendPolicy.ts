/**
 * Visual Runtime State Machine
 *
 * Tracks *send intent* independently of the OS capture hardware state.
 * The capture hardware (LocalScreenCapture) can be running while sending
 * is intentionally paused; this policy decides whether a captured frame
 * should actually be forwarded to the model.
 *
 * States
 * ──────
 *   inactive  – screen share is off; capture not running, sending blocked
 *   sleep     – screen share is on but automatic continuous sending is paused
 *   snapshot  – one explicit "analyze now" request; allows exactly one frame,
 *               then auto-reverts to sleep
 *   streaming – continuous sending; allows every frame until explicitly stopped
 *               (used for both explicit streaming and temporary bursts)
 *
 * Transitions
 * ───────────
 *   onScreenShareStarted()  → sleep        (from inactive)
 *   onScreenShareStopped()  → inactive     (from any state)
 *   armBootstrapSnapshot()  → snapshot     (from sleep; no cooldown set)
 *   analyzeScreenNow()      → snapshot     (from sleep or streaming; 3s cooldown)
 *   triggerSnapshot()       → snapshot     (from sleep; separate 2s cooldown)
 *   enableStreaming()        → streaming    (from non-inactive; explicit)
 *   stopStreaming()          → sleep        (from streaming)
 *   startBurst()             → streaming    (from sleep; visual-change burst)
 *   endBurst()               → sleep        (from streaming; burst expired)
 *   allowSend() in snapshot → consumes one frame → sleep
 *
 * Cooldowns
 * ─────────
 *   analyzeScreenNow uses VISUAL_SNAPSHOT_COOLDOWN_MS (3s).
 *   triggerSnapshot   uses VISUAL_TRIGGER_COOLDOWN_MS  (2s).
 *   armBootstrapSnapshot does NOT set any cooldown.
 *   All cooldowns are reset on screen share stop.
 */

export type VisualSendState = 'inactive' | 'sleep' | 'snapshot' | 'streaming';

/** Minimum interval between successive analyzeScreenNow() calls. */
export const VISUAL_SNAPSHOT_COOLDOWN_MS = 3000;

/** Minimum interval between successive triggerSnapshot() calls. */
export const VISUAL_TRIGGER_COOLDOWN_MS = 2000;

export type VisualSendTransitionReason =
  | 'screenShareStarted'
  | 'screenShareStopped'
  | 'bootstrap'
  | 'analyzeScreenNow'
  | 'snapshotConsumed'
  | 'enableStreaming'
  | 'stopStreaming'
  | 'speechTrigger'
  | 'textTrigger'
  | 'burstStart'
  | 'burstExpired';

export type VisualSendDiagnostics = {
  /** The reason for the most recent state transition, or null before any transition. */
  lastTransitionReason: VisualSendTransitionReason | null;
  /** How many times analyzeScreenNow() has been called (and transitioned to snapshot). */
  snapshotCount: number;
  /** ISO timestamp of the most recent transition into streaming, or null. */
  streamingEnteredAt: string | null;
  /** ISO timestamp of the most recent transition out of streaming, or null. */
  streamingEndedAt: string | null;
  /** Frames actually forwarded to the transport per send-policy state. */
  sentByState: {
    snapshot: number;
    streaming: number;
  };
  /**
   * Frames that arrived at the send gate but were dropped because
   * the visual send policy was not in an allowed state (inactive or sleep).
   */
  droppedByPolicy: number;
  /**
   * Frames that passed the policy gate (allowSend returned true) but
   * were blocked or dropped by the outbound gateway before reaching the
   * transport.
   */
  blockedByGateway: number;
  /** Number of trigger-initiated snapshots (speech + text). */
  triggerSnapshotCount: number;
  /** Number of burst periods started. */
  burstCount: number;
};

export type VisualSendPolicyOptions = {
  /** Injectable clock for deterministic tests.  Defaults to () => Date.now(). */
  nowMs?: () => number;
};

export type VisualSendPolicy = {
  /** Current state of the visual send state machine. */
  getState: () => VisualSendState;

  /**
   * Called when screen share hardware starts. Transitions inactive → sleep.
   * No-op from any other state.
   */
  onScreenShareStarted: () => void;

  /**
   * Called when screen share hardware stops. Always transitions to inactive.
   * Resets all cooldowns.
   */
  onScreenShareStopped: () => void;

  /**
   * Arms a bootstrap snapshot WITHOUT setting any cooldown timer.
   * Transitions sleep → snapshot.  No-op from other states.
   * This ensures that analyzeScreenNow() works immediately after start.
   */
  armBootstrapSnapshot: () => void;

  /**
   * Explicit "analyze screen now" request. Transitions sleep/streaming → snapshot.
   * No-op if inactive.  Subject to VISUAL_SNAPSHOT_COOLDOWN_MS.
   */
  analyzeScreenNow: () => void;

  /**
   * Trigger a snapshot from a local runtime event (speech start, text send).
   * Transitions sleep → snapshot.  No-op from other states.
   * Subject to a separate VISUAL_TRIGGER_COOLDOWN_MS.
   */
  triggerSnapshot: (reason: 'speechTrigger' | 'textTrigger') => void;

  /**
   * Enable continuous visual sending (explicit caller action).
   * Transitions any non-inactive state → streaming.
   */
  enableStreaming: () => void;

  /**
   * End continuous visual sending (explicit caller action).
   * Transitions streaming → sleep.  No-op from other states.
   */
  stopStreaming: () => void;

  /**
   * Start a temporary streaming burst (visual change detected).
   * Transitions sleep → streaming.  No-op from other states.
   */
  startBurst: () => void;

  /**
   * End a burst period, returning to sleep.
   * Transitions streaming → sleep.  No-op from other states.
   */
  endBurst: () => void;

  /**
   * Called at the frame-send gating point.  Returns true when the current
   * policy state permits forwarding a frame.  Non-consuming.
   */
  allowSend: () => boolean;

  /**
   * Called after the outbound gateway accepts a frame for dispatch.
   * Performs consuming side-effects (snapshot → sleep, counter increments).
   */
  onFrameDispatched: () => void;

  /** Increments droppedByPolicy counter. */
  onFrameDroppedByPolicy: () => void;

  /** Increments blockedByGateway counter. */
  onFrameBlockedByGateway: () => void;

  /** Returns a read-only diagnostics snapshot. */
  getDiagnostics: () => VisualSendDiagnostics;
};

export function createVisualSendPolicy(options?: VisualSendPolicyOptions): VisualSendPolicy {
  const nowMs = options?.nowMs ?? (() => Date.now());

  let state: VisualSendState = 'inactive';
  let lastTransitionReason: VisualSendTransitionReason | null = null;
  let snapshotCount = 0;
  let streamingEnteredAt: string | null = null;
  let streamingEndedAt: string | null = null;
  let sentSnapshot = 0;
  let sentStreaming = 0;
  let droppedByPolicy = 0;
  let blockedByGateway = 0;
  let triggerSnapshotCount = 0;
  let burstCount = 0;

  // Cooldown tracking – each cooldown is independent
  let lastSnapshotArmedAt: number | null = null;
  let lastTriggerArmedAt: number | null = null;

  function isSnapshotCooldownActive(): boolean {
    if (lastSnapshotArmedAt === null) return false;
    return nowMs() - lastSnapshotArmedAt < VISUAL_SNAPSHOT_COOLDOWN_MS;
  }

  function isTriggerCooldownActive(): boolean {
    if (lastTriggerArmedAt === null) return false;
    return nowMs() - lastTriggerArmedAt < VISUAL_TRIGGER_COOLDOWN_MS;
  }

  return {
    getState: () => state,

    onScreenShareStarted: () => {
      if (state === 'inactive') {
        state = 'sleep';
        lastTransitionReason = 'screenShareStarted';
      }
    },

    onScreenShareStopped: () => {
      state = 'inactive';
      lastTransitionReason = 'screenShareStopped';
      lastSnapshotArmedAt = null;
      lastTriggerArmedAt = null;
    },

    armBootstrapSnapshot: () => {
      if (state !== 'sleep') {
        return;
      }
      state = 'snapshot';
      snapshotCount += 1;
      lastTransitionReason = 'bootstrap';
      // Intentionally does NOT set lastSnapshotArmedAt or lastTriggerArmedAt
      // so that analyzeScreenNow() and triggerSnapshot() work immediately.
    },

    analyzeScreenNow: () => {
      if (state === 'inactive') {
        return;
      }
      if (isSnapshotCooldownActive()) {
        return;
      }
      state = 'snapshot';
      snapshotCount += 1;
      lastTransitionReason = 'analyzeScreenNow';
      lastSnapshotArmedAt = nowMs();
    },

    triggerSnapshot: (reason) => {
      if (state !== 'sleep') {
        return;
      }
      if (isTriggerCooldownActive()) {
        return;
      }
      state = 'snapshot';
      triggerSnapshotCount += 1;
      snapshotCount += 1;
      lastTransitionReason = reason;
      lastTriggerArmedAt = nowMs();
    },

    enableStreaming: () => {
      if (state === 'inactive') {
        return;
      }
      state = 'streaming';
      streamingEnteredAt = new Date().toISOString();
      lastTransitionReason = 'enableStreaming';
    },

    stopStreaming: () => {
      if (state === 'streaming') {
        state = 'sleep';
        streamingEndedAt = new Date().toISOString();
        lastTransitionReason = 'stopStreaming';
      }
    },

    startBurst: () => {
      if (state !== 'sleep') {
        return;
      }
      state = 'streaming';
      burstCount += 1;
      streamingEnteredAt = new Date().toISOString();
      lastTransitionReason = 'burstStart';
    },

    endBurst: () => {
      if (state === 'streaming') {
        state = 'sleep';
        streamingEndedAt = new Date().toISOString();
        lastTransitionReason = 'burstExpired';
      }
    },

    allowSend: () => {
      return state === 'snapshot' || state === 'streaming';
    },

    onFrameDispatched: () => {
      if (state === 'snapshot') {
        state = 'sleep';
        lastTransitionReason = 'snapshotConsumed';
        sentSnapshot += 1;
      } else if (state === 'streaming') {
        sentStreaming += 1;
      }
    },

    onFrameDroppedByPolicy: () => {
      droppedByPolicy += 1;
    },

    onFrameBlockedByGateway: () => {
      blockedByGateway += 1;
    },

    getDiagnostics: () => ({
      lastTransitionReason,
      snapshotCount,
      streamingEnteredAt,
      streamingEndedAt,
      sentByState: {
        snapshot: sentSnapshot,
        streaming: sentStreaming,
      },
      droppedByPolicy,
      blockedByGateway,
      triggerSnapshotCount,
      burstCount,
    }),
  };
}
