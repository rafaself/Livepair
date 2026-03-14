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
};

export function createVisualSendPolicy(): VisualSendPolicy {
  let state: VisualSendState = 'inactive';

  return {
    getState: () => state,

    onScreenShareStarted: () => {
      if (state === 'inactive') {
        state = 'sleep';
      }
    },

    onScreenShareStopped: () => {
      state = 'inactive';
    },

    analyzeScreenNow: () => {
      if (state === 'inactive') {
        return;
      }
      state = 'snapshot';
    },

    enableStreaming: () => {
      if (state === 'inactive') {
        return;
      }
      state = 'streaming';
    },

    stopStreaming: () => {
      if (state === 'streaming') {
        state = 'sleep';
      }
    },

    allowSend: () => {
      if (state === 'snapshot') {
        state = 'sleep';
        return true;
      }
      return state === 'streaming';
    },
  };
}
