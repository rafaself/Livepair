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
//   snapshot frame consumed     → sleep
//   stopStreaming() / cooldown   → sleep
//
// Gating:
//   inactive  → block
//   sleep     → block
//   snapshot  → allow (ONE frame), then auto-return to sleep
//   streaming → allow (every frame)
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

  it('allows a single frame send in snapshot state', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.analyzeScreenNow();
    expect(policy.allowSend()).toBe(true);
  });

  it('returns to sleep after consuming the snapshot frame', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.analyzeScreenNow();
    policy.allowSend(); // consumes the snapshot
    expect(policy.getState()).toBe('sleep');
  });

  it('blocks subsequent frames after snapshot is consumed', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.analyzeScreenNow();
    policy.allowSend(); // consume
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
    policy.allowSend(); // consume → sleep
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

  it('analyzeScreenNow from streaming moves to snapshot then back to sleep', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.enableStreaming();
    policy.analyzeScreenNow();
    expect(policy.getState()).toBe('snapshot');
    policy.allowSend();
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

  it('snapshot allows exactly one send then reverts', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.analyzeScreenNow();
    expect(policy.allowSend()).toBe(true);
    expect(policy.allowSend()).toBe(false);
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

  it('records lastTransitionReason as "snapshotConsumed" when snapshot frame is sent', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.analyzeScreenNow();
    policy.allowSend(); // consumes the snapshot → sleep
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
    policy.allowSend();
    now += 3000; // advance past cooldown
    policy.analyzeScreenNow();
    policy.allowSend();
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

  it('increments sentByState.snapshot when a snapshot frame is allowed', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.analyzeScreenNow();
    policy.allowSend();
    expect(policy.getDiagnostics().sentByState.snapshot).toBe(1);
  });

  it('increments sentByState.streaming for each frame allowed in streaming', () => {
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.enableStreaming();
    policy.allowSend();
    policy.allowSend();
    policy.allowSend();
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
    policy.allowSend(); // consume snapshot
    const snap2 = policy.getDiagnostics();
    // snap1 captured before allowSend
    expect(snap1.sentByState.snapshot).toBe(0);
    // snap2 captured after allowSend
    expect(snap2.sentByState.snapshot).toBe(1);
  });
});
