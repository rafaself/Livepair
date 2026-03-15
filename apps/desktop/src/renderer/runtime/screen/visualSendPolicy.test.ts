import { describe, expect, it } from 'vitest';
import { createVisualSendPolicy } from './visualSendPolicy';

// ---------------------------------------------------------------------------
// Wave 1 – Visual Runtime State Machine
//
// States: inactive | sleep | snapshot | streaming
//
// Transitions:
//   screen share off            → inactive
//   screen share on             → sleep
//   analyzeScreenNow()          → snapshot
//   enableStreaming()            → streaming
//   snapshot frame dispatched   → sleep  (via onFrameDispatched)
//   stopStreaming() / cooldown   → sleep
//
// Gating (allowSend is now a non-consuming check):
//   inactive  → block
//   sleep     → block
//   snapshot  → allow (check only; call onFrameDispatched to consume)
//   streaming → allow (check only; call onFrameDispatched to count)
// ---------------------------------------------------------------------------

describe('createVisualSendPolicy – initial state', () => {
  it('starts in inactive state', () => {
    const policy = createVisualSendPolicy();
    expect(policy.getState()).toBe('inactive');
  });

  it('blocks frame send when inactive', () => {
    const policy = createVisualSendPolicy();
    expect(policy.allowSend()).toBe(false);
  });
});

describe('createVisualSendPolicy – screen share on/off', () => {
  it('transitions to sleep when screen share starts', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    expect(policy.getState()).toBe('sleep');
  });

  it('transitions to inactive when screen share stops from sleep', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.onScreenShareStopped();
    expect(policy.getState()).toBe('inactive');
  });

  it('transitions to inactive when screen share stops from snapshot', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.analyzeScreenNow();
    policy.onScreenShareStopped();
    expect(policy.getState()).toBe('inactive');
  });

  it('transitions to inactive when screen share stops from streaming', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.enableStreaming();
    policy.onScreenShareStopped();
    expect(policy.getState()).toBe('inactive');
  });

  it('blocks frame send when in sleep state', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    expect(policy.allowSend()).toBe(false);
  });

  it('is no-op to stop screen share when already inactive', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStopped();
    expect(policy.getState()).toBe('inactive');
  });
});

describe('createVisualSendPolicy – snapshot (analyzeScreenNow)', () => {
  it('transitions to snapshot when analyzeScreenNow is called in sleep', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.analyzeScreenNow();
    expect(policy.getState()).toBe('snapshot');
  });

  it('allowSend returns true in snapshot state', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.analyzeScreenNow();
    expect(policy.allowSend()).toBe(true);
  });

  it('allowSend does not transition state (non-consuming check)', () => {
    // allowSend() is now a pure read: calling it repeatedly in snapshot must
    // not change state.  Only onFrameDispatched() drives the transition.
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.analyzeScreenNow();
    expect(policy.allowSend()).toBe(true);
    expect(policy.allowSend()).toBe(true); // still snapshot – not consumed yet
    expect(policy.getState()).toBe('snapshot');
  });

  it('returns to sleep after onFrameDispatched consumes the snapshot', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.analyzeScreenNow();
    policy.onFrameDispatched(); // consume the snapshot
    expect(policy.getState()).toBe('sleep');
  });

  it('blocks subsequent sends after snapshot is consumed via onFrameDispatched', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.analyzeScreenNow();
    policy.onFrameDispatched(); // consume → sleep
    expect(policy.allowSend()).toBe(false);
  });

  it('is no-op to call analyzeScreenNow when inactive (screen share off)', () => {
    const policy = createVisualSendPolicy();
    policy.analyzeScreenNow();
    expect(policy.getState()).toBe('inactive');
  });

  it('re-arms snapshot if analyzeScreenNow is called again after sleep', () => {
    let now = 0;
    const policy = createVisualSendPolicy({ nowMs: () => now });
    policy.onScreenShareStarted();
    policy.analyzeScreenNow();
    policy.onFrameDispatched(); // consume → sleep
    now += 3000; // advance past cooldown
    policy.analyzeScreenNow();
    expect(policy.getState()).toBe('snapshot');
    expect(policy.allowSend()).toBe(true);
  });
});

describe('createVisualSendPolicy – streaming', () => {
  it('transitions to streaming when enableStreaming is called in sleep', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.enableStreaming();
    expect(policy.getState()).toBe('streaming');
  });

  it('allows every frame send when streaming', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.enableStreaming();
    expect(policy.allowSend()).toBe(true);
    expect(policy.allowSend()).toBe(true);
    expect(policy.allowSend()).toBe(true);
    expect(policy.getState()).toBe('streaming');
  });

  it('returns to sleep when stopStreaming is called', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.enableStreaming();
    policy.stopStreaming();
    expect(policy.getState()).toBe('sleep');
  });

  it('blocks frame send after stopStreaming (back in sleep)', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.enableStreaming();
    policy.stopStreaming();
    expect(policy.allowSend()).toBe(false);
  });

  it('enableStreaming is no-op when inactive', () => {
    const policy = createVisualSendPolicy();
    policy.enableStreaming();
    expect(policy.getState()).toBe('inactive');
  });

  it('analyzeScreenNow from streaming moves to snapshot then back to sleep via onFrameDispatched', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.enableStreaming();
    policy.analyzeScreenNow();
    expect(policy.getState()).toBe('snapshot');
    policy.onFrameDispatched(); // consume snapshot → sleep
    expect(policy.getState()).toBe('sleep');
  });
});

describe('createVisualSendPolicy – gating summary', () => {
  it('inactive blocks send', () => {
    const policy = createVisualSendPolicy();
    expect(policy.allowSend()).toBe(false);
  });

  it('sleep blocks send', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    expect(policy.allowSend()).toBe(false);
  });

  it('snapshot allows send (non-consuming); onFrameDispatched transitions to sleep', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.analyzeScreenNow();
    expect(policy.allowSend()).toBe(true);
    policy.onFrameDispatched(); // consume
    expect(policy.allowSend()).toBe(false); // back in sleep
  });

  it('streaming allows unlimited sends', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.enableStreaming();
    for (let i = 0; i < 5; i++) {
      expect(policy.allowSend()).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Wave 3 – Visual Send Diagnostics
//
// The policy exposes a getDiagnostics() method returning a read-only snapshot
// of the last transition reason, snapshot/streaming counters, and per-state
// sent-frame counts.  No functional send behaviour changes.
// ---------------------------------------------------------------------------

describe('createVisualSendPolicy – getDiagnostics (Wave 3)', () => {
  it('returns zero counts and null reasons before any transitions', () => {
    const policy = createVisualSendPolicy();
    const d = policy.getDiagnostics();
    expect(d.lastTransitionReason).toBeNull();
    expect(d.snapshotCount).toBe(0);
    expect(d.streamingEnteredAt).toBeNull();
    expect(d.streamingEndedAt).toBeNull();
    expect(d.sentByState.snapshot).toBe(0);
    expect(d.sentByState.streaming).toBe(0);
  });

  it('records lastTransitionReason as "screenShareStarted" when screen share starts', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    expect(policy.getDiagnostics().lastTransitionReason).toBe('screenShareStarted');
  });

  it('records lastTransitionReason as "screenShareStopped" when screen share stops', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.onScreenShareStopped();
    expect(policy.getDiagnostics().lastTransitionReason).toBe('screenShareStopped');
  });

  it('records lastTransitionReason as "analyzeScreenNow" when snapshot is armed', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.analyzeScreenNow();
    expect(policy.getDiagnostics().lastTransitionReason).toBe('analyzeScreenNow');
  });

  it('records lastTransitionReason as "snapshotConsumed" when onFrameDispatched is called in snapshot', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.analyzeScreenNow();
    policy.onFrameDispatched(); // consume the snapshot → sleep
    expect(policy.getDiagnostics().lastTransitionReason).toBe('snapshotConsumed');
  });

  it('records lastTransitionReason as "enableStreaming" when streaming is enabled', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.enableStreaming();
    expect(policy.getDiagnostics().lastTransitionReason).toBe('enableStreaming');
  });

  it('records lastTransitionReason as "stopStreaming" when streaming is stopped', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.enableStreaming();
    policy.stopStreaming();
    expect(policy.getDiagnostics().lastTransitionReason).toBe('stopStreaming');
  });

  it('increments snapshotCount each time analyzeScreenNow is called', () => {
    let now = 0;
    const policy = createVisualSendPolicy({ nowMs: () => now });
    policy.onScreenShareStarted();
    policy.analyzeScreenNow();
    policy.onFrameDispatched();
    now += 3000; // advance past cooldown
    policy.analyzeScreenNow();
    policy.onFrameDispatched();
    expect(policy.getDiagnostics().snapshotCount).toBe(2);
  });

  it('sets streamingEnteredAt when enableStreaming transitions to streaming', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    const before = Date.now();
    policy.enableStreaming();
    const after = Date.now();
    const enteredAt = policy.getDiagnostics().streamingEnteredAt;
    expect(enteredAt).not.toBeNull();
    expect(new Date(enteredAt!).getTime()).toBeGreaterThanOrEqual(before);
    expect(new Date(enteredAt!).getTime()).toBeLessThanOrEqual(after);
  });

  it('sets streamingEndedAt when stopStreaming is called', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.enableStreaming();
    const before = Date.now();
    policy.stopStreaming();
    const after = Date.now();
    const endedAt = policy.getDiagnostics().streamingEndedAt;
    expect(endedAt).not.toBeNull();
    expect(new Date(endedAt!).getTime()).toBeGreaterThanOrEqual(before);
    expect(new Date(endedAt!).getTime()).toBeLessThanOrEqual(after);
  });

  it('increments sentByState.snapshot when onFrameDispatched is called in snapshot state', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.analyzeScreenNow();
    policy.onFrameDispatched();
    expect(policy.getDiagnostics().sentByState.snapshot).toBe(1);
  });

  it('increments sentByState.streaming for each onFrameDispatched call in streaming', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.enableStreaming();
    policy.onFrameDispatched();
    policy.onFrameDispatched();
    policy.onFrameDispatched();
    expect(policy.getDiagnostics().sentByState.streaming).toBe(3);
  });

  it('does not increment sentByState when allowSend is called in sleep or inactive', () => {
    const policy = createVisualSendPolicy();
    policy.allowSend(); // inactive
    policy.onScreenShareStarted();
    policy.allowSend(); // sleep
    const d = policy.getDiagnostics();
    expect(d.sentByState.snapshot).toBe(0);
    expect(d.sentByState.streaming).toBe(0);
  });

  it('getDiagnostics returns a consistent snapshot that does not change retroactively', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.analyzeScreenNow();
    const snap1 = policy.getDiagnostics();
    policy.onFrameDispatched(); // consume snapshot
    const snap2 = policy.getDiagnostics();
    // snap1 captured before onFrameDispatched
    expect(snap1.sentByState.snapshot).toBe(0);
    // snap2 captured after onFrameDispatched
    expect(snap2.sentByState.snapshot).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Wave 4 – Capture vs Send Diagnostics Separation
//
// Adds distinct accounting for:
//   - frames captured (existing frameCount in ScreenCaptureDiagnostics)
//   - frames sent (existing sentByState in VisualSendDiagnostics)
//   - frames dropped because the policy blocked them (new droppedByPolicy)
//   - frames blocked/dropped by the outbound gateway (new blockedByGateway)
// ---------------------------------------------------------------------------

describe('createVisualSendPolicy – Wave 4 drop/block diagnostics', () => {
  it('starts with zero droppedByPolicy and blockedByGateway', () => {
    const policy = createVisualSendPolicy();
    const d = policy.getDiagnostics();
    expect(d.droppedByPolicy).toBe(0);
    expect(d.blockedByGateway).toBe(0);
  });

  it('increments droppedByPolicy when onFrameDroppedByPolicy is called in sleep state', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted(); // → sleep (allowSend = false)
    policy.onFrameDroppedByPolicy();
    expect(policy.getDiagnostics().droppedByPolicy).toBe(1);
  });

  it('increments droppedByPolicy when onFrameDroppedByPolicy is called in inactive state', () => {
    const policy = createVisualSendPolicy();
    // still inactive; allowSend would return false
    policy.onFrameDroppedByPolicy();
    expect(policy.getDiagnostics().droppedByPolicy).toBe(1);
  });

  it('accumulates droppedByPolicy across multiple policy-blocked frames', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.onFrameDroppedByPolicy();
    policy.onFrameDroppedByPolicy();
    policy.onFrameDroppedByPolicy();
    expect(policy.getDiagnostics().droppedByPolicy).toBe(3);
  });

  it('increments blockedByGateway when onFrameBlockedByGateway is called', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.analyzeScreenNow(); // → snapshot (allowSend = true)
    policy.onFrameBlockedByGateway();
    expect(policy.getDiagnostics().blockedByGateway).toBe(1);
  });

  it('accumulates blockedByGateway across multiple gateway-blocked frames', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.enableStreaming();
    policy.onFrameBlockedByGateway();
    policy.onFrameBlockedByGateway();
    expect(policy.getDiagnostics().blockedByGateway).toBe(2);
  });

  it('does not affect sentByState when a frame is dropped by policy', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.onFrameDroppedByPolicy();
    const d = policy.getDiagnostics();
    expect(d.sentByState.snapshot).toBe(0);
    expect(d.sentByState.streaming).toBe(0);
  });

  it('does not affect sentByState when a frame is blocked by gateway', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.analyzeScreenNow();
    policy.onFrameBlockedByGateway();
    const d = policy.getDiagnostics();
    expect(d.sentByState.snapshot).toBe(0);
    expect(d.sentByState.streaming).toBe(0);
  });

  it('does not consume snapshot state when a frame is blocked by gateway', () => {
    // A gateway-blocked frame must NOT transition snapshot → sleep.
    // The snapshot must still be armed for the next incoming frame.
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.analyzeScreenNow(); // → snapshot
    policy.onFrameBlockedByGateway(); // blocked – snapshot should survive
    expect(policy.getState()).toBe('snapshot');
    expect(policy.allowSend()).toBe(true);
  });

  it('droppedByPolicy and blockedByGateway are independent of each other', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.onFrameDroppedByPolicy();
    policy.analyzeScreenNow();
    policy.onFrameBlockedByGateway();
    const d = policy.getDiagnostics();
    expect(d.droppedByPolicy).toBe(1);
    expect(d.blockedByGateway).toBe(1);
  });

  it('all four counters remain independent: captured(external), sent, droppedByPolicy, blockedByGateway', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    // 2 frames arrive but policy blocks them (sleep)
    policy.onFrameDroppedByPolicy();
    policy.onFrameDroppedByPolicy();
    // arm snapshot; 1 frame allowed but gateway blocks it
    policy.analyzeScreenNow();
    policy.onFrameBlockedByGateway();
    // arm snapshot again (after cooldown); 1 frame dispatched
    // (we don't advance time here – just testing counter isolation)
    const d = policy.getDiagnostics();
    expect(d.droppedByPolicy).toBe(2);
    expect(d.blockedByGateway).toBe(1);
    expect(d.sentByState.snapshot).toBe(0);
    expect(d.sentByState.streaming).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Wave 2 – Smart Triggers, Bootstrap, and Burst
// ---------------------------------------------------------------------------
describe('createVisualSendPolicy – Wave 2 smart triggers', () => {
  // ── armBootstrapSnapshot ─────────────────────────────────────────────────

  it('armBootstrapSnapshot transitions sleep → snapshot with bootstrap reason', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.armBootstrapSnapshot();
    expect(policy.getState()).toBe('snapshot');
    expect(policy.getDiagnostics().lastTransitionReason).toBe('bootstrap');
  });

  it('armBootstrapSnapshot is no-op from inactive', () => {
    const policy = createVisualSendPolicy();
    policy.armBootstrapSnapshot();
    expect(policy.getState()).toBe('inactive');
  });

  it('armBootstrapSnapshot is no-op from snapshot or streaming', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.enableStreaming();
    policy.armBootstrapSnapshot();
    expect(policy.getState()).toBe('streaming');
  });

  it('armBootstrapSnapshot does NOT set analyzeScreenNow cooldown', () => {
    const now = 0;
    const policy = createVisualSendPolicy({ nowMs: () => now });
    policy.onScreenShareStarted();
    policy.armBootstrapSnapshot();

    // Consume bootstrap
    policy.onFrameDispatched();
    expect(policy.getState()).toBe('sleep');

    // analyzeScreenNow should work immediately (no cooldown from bootstrap)
    policy.analyzeScreenNow();
    expect(policy.getState()).toBe('snapshot');
    expect(policy.getDiagnostics().lastTransitionReason).toBe('analyzeScreenNow');
  });

  it('armBootstrapSnapshot does NOT set trigger cooldown', () => {
    const now = 0;
    const policy = createVisualSendPolicy({ nowMs: () => now });
    policy.onScreenShareStarted();
    policy.armBootstrapSnapshot();

    // Consume bootstrap
    policy.onFrameDispatched();
    expect(policy.getState()).toBe('sleep');

    // triggerSnapshot should work immediately (no cooldown from bootstrap)
    policy.triggerSnapshot('speechTrigger');
    expect(policy.getState()).toBe('snapshot');
    expect(policy.getDiagnostics().lastTransitionReason).toBe('speechTrigger');
  });

  // ── triggerSnapshot ──────────────────────────────────────────────────────

  it('triggerSnapshot(speechTrigger) transitions sleep → snapshot', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.triggerSnapshot('speechTrigger');
    expect(policy.getState()).toBe('snapshot');
    expect(policy.getDiagnostics().lastTransitionReason).toBe('speechTrigger');
    expect(policy.getDiagnostics().triggerSnapshotCount).toBe(1);
  });

  it('triggerSnapshot(textTrigger) transitions sleep → snapshot', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.triggerSnapshot('textTrigger');
    expect(policy.getState()).toBe('snapshot');
    expect(policy.getDiagnostics().lastTransitionReason).toBe('textTrigger');
    expect(policy.getDiagnostics().triggerSnapshotCount).toBe(1);
  });

  it('triggerSnapshot is no-op from inactive', () => {
    const policy = createVisualSendPolicy();
    policy.triggerSnapshot('speechTrigger');
    expect(policy.getState()).toBe('inactive');
    expect(policy.getDiagnostics().triggerSnapshotCount).toBe(0);
  });

  it('triggerSnapshot is no-op from snapshot (bootstrap pending)', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.armBootstrapSnapshot();
    policy.triggerSnapshot('speechTrigger');
    // Still in snapshot from bootstrap, trigger was a no-op
    expect(policy.getDiagnostics().lastTransitionReason).toBe('bootstrap');
    expect(policy.getDiagnostics().triggerSnapshotCount).toBe(0);
  });

  it('triggerSnapshot is no-op from explicit streaming', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.enableStreaming();
    policy.triggerSnapshot('speechTrigger');
    expect(policy.getState()).toBe('streaming');
    expect(policy.getDiagnostics().triggerSnapshotCount).toBe(0);
  });

  it('triggerSnapshot interrupts a passive burst and arms a snapshot', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.startBurst();

    policy.triggerSnapshot('speechTrigger');

    expect(policy.getState()).toBe('snapshot');
    expect(policy.isPassiveBurstActive()).toBe(false);
    expect(policy.getDiagnostics().lastTransitionReason).toBe('speechTrigger');
    expect(policy.getDiagnostics().triggerSnapshotCount).toBe(1);
  });

  it('triggerSnapshot respects its own cooldown', () => {
    let now = 0;
    const policy = createVisualSendPolicy({ nowMs: () => now });
    policy.onScreenShareStarted();

    policy.triggerSnapshot('speechTrigger');
    expect(policy.getState()).toBe('snapshot');
    policy.onFrameDispatched(); // consume → sleep

    // Within 2s cooldown → no-op
    now += 1000;
    policy.triggerSnapshot('textTrigger');
    expect(policy.getState()).toBe('sleep');

    // After cooldown → works
    now += 1500; // total 2500ms > 2000ms
    policy.triggerSnapshot('textTrigger');
    expect(policy.getState()).toBe('snapshot');
    expect(policy.getDiagnostics().triggerSnapshotCount).toBe(2);
  });

  it('trigger cooldown is independent of analyzeScreenNow cooldown', () => {
    const now = 0;
    const policy = createVisualSendPolicy({ nowMs: () => now });
    policy.onScreenShareStarted();

    // Set analyzeScreenNow cooldown
    policy.analyzeScreenNow();
    policy.onFrameDispatched(); // consume → sleep

    // triggerSnapshot should work immediately (different cooldown)
    policy.triggerSnapshot('speechTrigger');
    expect(policy.getState()).toBe('snapshot');
  });

  it('analyzeScreenNow cooldown is independent of trigger cooldown', () => {
    const now = 0;
    const policy = createVisualSendPolicy({ nowMs: () => now });
    policy.onScreenShareStarted();

    // Set trigger cooldown
    policy.triggerSnapshot('speechTrigger');
    policy.onFrameDispatched(); // consume → sleep

    // analyzeScreenNow should work immediately (different cooldown)
    policy.analyzeScreenNow();
    expect(policy.getState()).toBe('snapshot');
  });

  // ── startBurst / endBurst ────────────────────────────────────────────────

  it('startBurst transitions sleep → streaming with burstStart reason', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.startBurst();
    expect(policy.getState()).toBe('streaming');
    expect(policy.getDiagnostics().lastTransitionReason).toBe('burstStart');
    expect(policy.getDiagnostics().burstCount).toBe(1);
  });

  it('startBurst is no-op from streaming', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.enableStreaming();
    policy.startBurst();
    // Still in streaming but reason unchanged
    expect(policy.getDiagnostics().lastTransitionReason).toBe('enableStreaming');
    expect(policy.getDiagnostics().burstCount).toBe(0);
  });

  it('startBurst is no-op from snapshot', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.armBootstrapSnapshot();
    policy.startBurst();
    expect(policy.getState()).toBe('snapshot');
    expect(policy.getDiagnostics().burstCount).toBe(0);
  });

  it('startBurst is no-op from inactive', () => {
    const policy = createVisualSendPolicy();
    policy.startBurst();
    expect(policy.getState()).toBe('inactive');
    expect(policy.getDiagnostics().burstCount).toBe(0);
  });

  it('endBurst transitions streaming → sleep with burstExpired reason', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.startBurst();
    policy.endBurst();
    expect(policy.getState()).toBe('sleep');
    expect(policy.getDiagnostics().lastTransitionReason).toBe('burstExpired');
  });

  it('endBurst is no-op from sleep', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.endBurst();
    expect(policy.getState()).toBe('sleep');
    expect(policy.getDiagnostics().lastTransitionReason).toBe('screenShareStarted');
  });

  it('frames are sent during burst (streaming state)', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.startBurst();
    expect(policy.allowSend()).toBe(true);
    policy.onFrameDispatched();
    expect(policy.getState()).toBe('streaming'); // stays streaming
    expect(policy.getDiagnostics().sentByState.streaming).toBe(1);
  });

  // ── cooldown reset on stop ───────────────────────────────────────────────

  it('onScreenShareStopped resets both cooldowns', () => {
    const now = 0;
    const policy = createVisualSendPolicy({ nowMs: () => now });
    policy.onScreenShareStarted();

    // Set both cooldowns
    policy.analyzeScreenNow();
    policy.onFrameDispatched();
    policy.triggerSnapshot('speechTrigger');
    policy.onFrameDispatched();

    policy.onScreenShareStopped();

    // Start a new session
    policy.onScreenShareStarted();

    // Both should work immediately
    policy.analyzeScreenNow();
    expect(policy.getState()).toBe('snapshot');
    policy.onFrameDispatched();

    policy.triggerSnapshot('textTrigger');
    expect(policy.getState()).toBe('snapshot');
  });

  // ── diagnostics ──────────────────────────────────────────────────────────

  it('diagnostics include triggerSnapshotCount and burstCount', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();

    policy.triggerSnapshot('speechTrigger');
    policy.onFrameDispatched();
    policy.startBurst();
    policy.endBurst();
    policy.startBurst();
    policy.endBurst();

    const d = policy.getDiagnostics();
    expect(d.triggerSnapshotCount).toBe(1);
    expect(d.burstCount).toBe(2);
  });
});

describe('createVisualSendPolicy – Wave 6 passive burst bounds', () => {
  it('ends a passive burst immediately when the hard frame budget is exhausted', () => {
    const policy = createVisualSendPolicy({ burstMaxFrames: 2 });
    policy.onScreenShareStarted();
    policy.startBurst();

    policy.onFrameDispatched();
    expect(policy.getState()).toBe('streaming');
    expect(policy.isPassiveBurstActive()).toBe(true);

    policy.onFrameDispatched();
    expect(policy.getState()).toBe('sleep');
    expect(policy.isPassiveBurstActive()).toBe(false);
    expect(policy.getDiagnostics().lastTransitionReason).toBe('burstExpired');
  });

  it('blocks passive burst re-entry until the cooldown expires after budget exhaustion', () => {
    let now = 0;
    const policy = createVisualSendPolicy({
      nowMs: () => now,
      burstMaxFrames: 1,
      burstReentryCooldownMs: 3000,
    });
    policy.onScreenShareStarted();
    policy.startBurst();
    policy.onFrameDispatched();

    expect(policy.getState()).toBe('sleep');

    policy.startBurst();
    expect(policy.getState()).toBe('sleep');

    now += 3000;
    policy.startBurst();
    expect(policy.getState()).toBe('streaming');
  });

  it('enableStreaming converts a passive burst into explicit streaming so burst budget no longer applies', () => {
    const policy = createVisualSendPolicy({ burstMaxFrames: 1 });
    policy.onScreenShareStarted();
    policy.startBurst();

    policy.enableStreaming();
    expect(policy.getState()).toBe('streaming');
    expect(policy.isPassiveBurstActive()).toBe(false);

    policy.onFrameDispatched();
    policy.onFrameDispatched();
    expect(policy.getState()).toBe('streaming');
  });

  it('analyzeScreenNow interrupts a passive burst without arming passive re-entry cooldown', () => {
    const now = 0;
    const policy = createVisualSendPolicy({
      nowMs: () => now,
      burstReentryCooldownMs: 3000,
    });
    policy.onScreenShareStarted();
    policy.startBurst();

    policy.analyzeScreenNow();
    expect(policy.getState()).toBe('snapshot');
    expect(policy.isPassiveBurstActive()).toBe(false);

    policy.onFrameDispatched();
    policy.startBurst();
    expect(policy.getState()).toBe('streaming');
  });
});
