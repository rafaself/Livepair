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
 */

export type VisualSendState = 'inactive' | 'sleep' | 'snapshot' | 'streaming';

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
  /** Frames actually forwarded (allowSend returned true) per state. */
  sentByState: {
    snapshot: number;
    streaming: number;
  };
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
   */
  onScreenShareStopped: () => void;
  /**
   * Explicit "analyze screen now" request. Transitions sleep/streaming → snapshot.
   * No-op if inactive.
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
   * Called at the frame-send gating point.
   * Returns true when the current frame should be forwarded to the model.
   * Side effect: if state is `snapshot`, transitions to `sleep` after returning true
   * (exactly one frame is allowed per analyzeScreenNow call).
   */
  allowSend: () => boolean;
  /**
   * Wave 3 – returns a read-only diagnostics snapshot.
   * Each call returns a new object; the caller owns the reference.
   */
  getDiagnostics: () => VisualSendDiagnostics;
};

export function createVisualSendPolicy(): VisualSendPolicy {
  let state: VisualSendState = 'inactive';
  let lastTransitionReason: VisualSendTransitionReason | null = null;
  let snapshotCount = 0;
  let streamingEnteredAt: string | null = null;
  let streamingEndedAt: string | null = null;
  let sentSnapshot = 0;
  let sentStreaming = 0;

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
    },

    analyzeScreenNow: () => {
      if (state === 'inactive') {
        return;
      }
      state = 'snapshot';
      snapshotCount += 1;
      lastTransitionReason = 'analyzeScreenNow';
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
      if (state === 'snapshot') {
        state = 'sleep';
        lastTransitionReason = 'snapshotConsumed';
        sentSnapshot += 1;
        return true;
      }
      if (state === 'streaming') {
        sentStreaming += 1;
        return true;
      }
      return false;
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
    }),
  };
}
