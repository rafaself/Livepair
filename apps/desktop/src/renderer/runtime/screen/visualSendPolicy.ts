/**
 * Wave 1 – Visual Runtime State Machine
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
 *
 * Transitions
 * ───────────
 *   onScreenShareStarted()  → sleep        (from inactive)
 *   onScreenShareStopped()  → inactive     (from any state)
 *   analyzeScreenNow()      → snapshot     (from sleep or streaming, no-op if inactive)
 *   enableStreaming()        → streaming    (from sleep, no-op if inactive)
 *   stopStreaming()          → sleep        (from streaming)
 *   allowSend() in snapshot → consumes one frame → sleep
 *
 * Wave 7 – Snapshot Cooldown
 * ──────────────────────────
 *   A minimum interval (VISUAL_SNAPSHOT_COOLDOWN_MS) is enforced between
 *   successive analyzeScreenNow() calls that arm the snapshot state.
 *   Calls within the cooldown window are silently ignored (same as the
 *   inactive no-op).  Stopping screen share resets the cooldown.
 *   The clock is injectable via the options parameter for deterministic tests.
 */

export type VisualSendState = 'inactive' | 'sleep' | 'snapshot' | 'streaming';

/**
 * Wave 7 – Minimum interval between successive analyzeScreenNow() calls
 * that successfully arm the snapshot state.
 */
export const VISUAL_SNAPSHOT_COOLDOWN_MS = 3000;

/**
 * Wave 3 – read-only diagnostics snapshot returned by getDiagnostics().
 * Updated on every state transition and on every allowed frame send.
 */
export type VisualSendTransitionReason =
  | 'screenShareStarted'
  | 'screenShareStopped'
  | 'analyzeScreenNow'
  | 'snapshotConsumed'
  | 'enableStreaming'
  | 'stopStreaming';

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
   * Wave 4 – frames that arrived at the send gate but were dropped because
   * the visual send policy was not in an allowed state (inactive or sleep).
   * These frames were captured by the hardware but never reached the model.
   */
  droppedByPolicy: number;
  /**
   * Wave 4 – frames that passed the policy gate (allowSend returned true) but
   * were blocked or dropped by the outbound gateway before reaching the
   * transport.  These frames were not seen by the model.
   */
  blockedByGateway: number;
};

export type VisualSendPolicyOptions = {
  /**
   * Wave 7 – injectable clock for deterministic tests.
   * Defaults to () => Date.now().
   */
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
   * Wave 7: also resets the snapshot cooldown.
   */
  onScreenShareStopped: () => void;
  /**
   * Explicit "analyze screen now" request. Transitions sleep/streaming → snapshot.
   * No-op if inactive.
   * Wave 7: no-op if the snapshot cooldown is still active.
   */
  analyzeScreenNow: () => void;
  /**
   * Enable continuous visual sending. Transitions sleep → streaming.
   * No-op if inactive.
   */
  enableStreaming: () => void;
  /**
   * End continuous visual sending. Transitions streaming → sleep.
   * No-op from other states.
   */
  stopStreaming: () => void;
  /**
   * Called at the frame-send gating point (before submitting to the outbound gateway).
   * Returns true when the current policy state permits forwarding a frame.
   * Non-consuming: does NOT transition snapshot → sleep. Call onFrameDispatched()
   * after the gateway accepts the frame to perform the state transition and update
   * diagnostics counters.
   */
  allowSend: () => boolean;
  /**
   * Wave 3 – called after the outbound gateway accepts a frame for dispatch.
   * Performs the consuming side-effects that allowSend() no longer applies eagerly:
   *   - snapshot state: transitions to sleep and increments the snapshot-sent counter
   *   - streaming state: increments the streaming-sent counter
   * Must only be called when allowSend() returned true AND the gateway did not
   * block or drop the frame.
   */
  onFrameDispatched: () => void;
  /**
   * Wave 4 – called when a frame is dropped because the policy did not allow
   * sending (allowSend() returned false, i.e. state is inactive or sleep).
   * Increments droppedByPolicy for diagnostic clarity.
   */
  onFrameDroppedByPolicy: () => void;
  /**
   * Wave 4 – called when a frame passed the policy gate (allowSend returned
   * true) but was subsequently blocked or dropped by the outbound gateway.
   * Increments blockedByGateway so the distinction between "sent" and
   * "gateway-blocked" is observable in diagnostics.
   */
  onFrameBlockedByGateway: () => void;
  /**
   * Wave 3 – returns a read-only diagnostics snapshot.
   * Each call returns a new object; the caller owns the reference.
   */
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
  // Wave 4 – capture vs send distinction
  let droppedByPolicy = 0;
  let blockedByGateway = 0;

  // Wave 7 – cooldown tracking
  let lastSnapshotArmedAt: number | null = null;

  function isCooldownActive(): boolean {
    if (lastSnapshotArmedAt === null) return false;
    return nowMs() - lastSnapshotArmedAt < VISUAL_SNAPSHOT_COOLDOWN_MS;
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
      // Wave 7: reset cooldown so the next session starts clean
      lastSnapshotArmedAt = null;
    },

    analyzeScreenNow: () => {
      if (state === 'inactive') {
        return;
      }
      // Wave 7: suppress if cooldown is still active
      if (isCooldownActive()) {
        return;
      }
      state = 'snapshot';
      snapshotCount += 1;
      lastTransitionReason = 'analyzeScreenNow';
      lastSnapshotArmedAt = nowMs();
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
    }),
  };
}
