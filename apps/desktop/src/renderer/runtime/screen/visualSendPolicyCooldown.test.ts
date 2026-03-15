import { describe, expect, it } from 'vitest';
import { createVisualSendPolicy } from './visualSendPolicy';

// ---------------------------------------------------------------------------
// Wave 7 – Snapshot Cooldown & Anti-Thrash
//
// analyzeScreenNow() must not re-arm the snapshot state while the cooldown
// is still active.  This prevents a caller from hammering the policy with
// repeated analyze calls and causing rapid snapshot → sleep → snapshot churn.
//
// Design invariants for this wave:
//   - A cooldown of VISUAL_SNAPSHOT_COOLDOWN_MS (default 3 000 ms) is
//     enforced between successive analyzeScreenNow() transitions.
//   - A call to analyzeScreenNow() while a cooldown is active is silently
//     ignored (same as the inactive no-op).
//   - After the cooldown expires the next call succeeds normally.
//   - The clock is injectable (nowMs parameter in createVisualSendPolicy) so
//     tests remain deterministic without real timers.
//   - Waves 1–6 state-machine behaviour is fully preserved outside the
//     cooldown window.
//   - streaming→snapshot transitions (analyzeScreenNow from streaming) also
//     respect the cooldown.
//
// Note (Wave 3): allowSend() is now a non-consuming check. Use
// onFrameDispatched() to drive the snapshot→sleep transition.
// ---------------------------------------------------------------------------

describe('Wave 7 – snapshot cooldown: basic enforcement', () => {
  it('first analyzeScreenNow() call always succeeds (no prior cooldown)', () => {
    const now = 0;
    const policy = createVisualSendPolicy({ nowMs: () => now });
    policy.onScreenShareStarted();
    policy.analyzeScreenNow();
    expect(policy.getState()).toBe('snapshot');
  });

  it('second analyzeScreenNow() is ignored while cooldown is active', () => {
    let now = 0;
    const policy = createVisualSendPolicy({ nowMs: () => now });
    policy.onScreenShareStarted();
    policy.analyzeScreenNow();
    policy.onFrameDispatched(); // consume → sleep

    // Advance time but not past the cooldown
    now += 1000;
    policy.analyzeScreenNow();
    expect(policy.getState()).toBe('sleep'); // still blocked
  });

  it('analyzeScreenNow() succeeds once cooldown has expired', () => {
    let now = 0;
    const policy = createVisualSendPolicy({ nowMs: () => now });
    policy.onScreenShareStarted();
    policy.analyzeScreenNow();
    policy.onFrameDispatched(); // consume → sleep

    // Advance past the cooldown
    now += 3000;
    policy.analyzeScreenNow();
    expect(policy.getState()).toBe('snapshot');
  });

  it('cooldown boundary: exactly at cooldown ms is allowed', () => {
    let now = 0;
    const policy = createVisualSendPolicy({ nowMs: () => now });
    policy.onScreenShareStarted();
    policy.analyzeScreenNow();
    policy.onFrameDispatched();

    now += 3000; // exactly at boundary
    policy.analyzeScreenNow();
    expect(policy.getState()).toBe('snapshot');
  });

  it('cooldown boundary: one ms before cooldown is still blocked', () => {
    let now = 0;
    const policy = createVisualSendPolicy({ nowMs: () => now });
    policy.onScreenShareStarted();
    policy.analyzeScreenNow();
    policy.onFrameDispatched();

    now += 2999; // one ms short
    policy.analyzeScreenNow();
    expect(policy.getState()).toBe('sleep');
  });
});

describe('Wave 7 – snapshot cooldown: rapid-fire suppression', () => {
  it('multiple rapid calls are all suppressed except the first', () => {
    let now = 0;
    const policy = createVisualSendPolicy({ nowMs: () => now });
    policy.onScreenShareStarted();

    policy.analyzeScreenNow(); // arm
    policy.onFrameDispatched(); // consume → sleep

    // Five rapid calls within the cooldown window
    for (let i = 0; i < 5; i++) {
      now += 100;
      policy.analyzeScreenNow();
      expect(policy.getState()).toBe('sleep');
    }
    // Still exactly 1 snapshot consumed
    expect(policy.getDiagnostics().snapshotCount).toBe(1);
  });

  it('prevents snapshot/sleep thrash under noisy repeated triggers', () => {
    let now = 0;
    const policy = createVisualSendPolicy({ nowMs: () => now });
    policy.onScreenShareStarted();

    // Simulate caller invoking analyzeScreenNow + onFrameDispatched rapidly 10 times
    // within 2 seconds total (200 ms apart)
    let snapshotsArmed = 0;
    for (let i = 0; i < 10; i++) {
      now += 200;
      policy.analyzeScreenNow();
      if (policy.getState() === 'snapshot') {
        snapshotsArmed++;
        policy.onFrameDispatched();
      }
    }

    // Only the first call (at 200 ms) should have armed; the rest are within cooldown
    expect(snapshotsArmed).toBe(1);
  });
});

describe('Wave 7 – snapshot cooldown: streaming path', () => {
  it('analyzeScreenNow from streaming respects cooldown', () => {
    let now = 0;
    const policy = createVisualSendPolicy({ nowMs: () => now });
    policy.onScreenShareStarted();

    // First snapshot from sleep
    policy.analyzeScreenNow();
    policy.onFrameDispatched(); // → sleep
    // Enter streaming
    policy.enableStreaming();
    // Try analyzeScreenNow from streaming within cooldown
    now += 500;
    policy.analyzeScreenNow();
    expect(policy.getState()).toBe('streaming'); // not interrupted
  });

  it('analyzeScreenNow from streaming works after cooldown expires', () => {
    let now = 0;
    const policy = createVisualSendPolicy({ nowMs: () => now });
    policy.onScreenShareStarted();

    policy.analyzeScreenNow();
    policy.onFrameDispatched(); // → sleep
    policy.enableStreaming();

    now += 3000;
    policy.analyzeScreenNow();
    expect(policy.getState()).toBe('snapshot');
  });
});

describe('Wave 7 – snapshot cooldown: reset on screen share stop', () => {
  it('stopping and restarting screen share resets the cooldown', () => {
    let now = 0;
    const policy = createVisualSendPolicy({ nowMs: () => now });
    policy.onScreenShareStarted();
    policy.analyzeScreenNow();
    policy.onFrameDispatched();

    // Stop and restart
    policy.onScreenShareStopped();
    policy.onScreenShareStarted();

    // Cooldown should be reset; analyzeScreenNow should succeed
    now += 100; // well within what would have been the cooldown
    policy.analyzeScreenNow();
    expect(policy.getState()).toBe('snapshot');
  });
});

describe('Wave 7 – no default clock (real Date.now)', () => {
  it('createVisualSendPolicy() works with no options (uses real clock)', () => {
    // Smoke test: no options still creates a working policy
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.analyzeScreenNow();
    expect(policy.getState()).toBe('snapshot');
    policy.onFrameDispatched();
    expect(policy.getState()).toBe('sleep');
  });
});

describe('Wave 7 – cooldown diagnostics', () => {
  it('snapshotCount does not increment for suppressed analyzeScreenNow calls', () => {
    let now = 0;
    const policy = createVisualSendPolicy({ nowMs: () => now });
    policy.onScreenShareStarted();
    policy.analyzeScreenNow(); // count = 1
    policy.onFrameDispatched();

    now += 500; // within cooldown
    policy.analyzeScreenNow(); // suppressed
    policy.analyzeScreenNow(); // suppressed

    expect(policy.getDiagnostics().snapshotCount).toBe(1);
  });

  it('snapshotCount increments normally once cooldown expires', () => {
    let now = 0;
    const policy = createVisualSendPolicy({ nowMs: () => now });
    policy.onScreenShareStarted();
    policy.analyzeScreenNow(); // count = 1
    policy.onFrameDispatched();

    now += 3000;
    policy.analyzeScreenNow(); // count = 2
    policy.onFrameDispatched();

    expect(policy.getDiagnostics().snapshotCount).toBe(2);
  });
});

describe('Wave 7 – Wave 1 non-regression: cooldown does not affect non-snapshot transitions', () => {
  it('enableStreaming and stopStreaming are not affected by snapshot cooldown', () => {
    let now = 0;
    const policy = createVisualSendPolicy({ nowMs: () => now });
    policy.onScreenShareStarted();
    policy.analyzeScreenNow();
    policy.onFrameDispatched();

    // Streaming transitions should work normally within cooldown window
    now += 100;
    policy.enableStreaming();
    expect(policy.getState()).toBe('streaming');
    policy.stopStreaming();
    expect(policy.getState()).toBe('sleep');
  });

  it('onScreenShareStopped always transitions to inactive regardless of cooldown', () => {
    const now = 0;
    const policy = createVisualSendPolicy({ nowMs: () => now });
    policy.onScreenShareStarted();
    policy.analyzeScreenNow();
    // Don't consume — we're in snapshot state, within cooldown
    policy.onScreenShareStopped();
    expect(policy.getState()).toBe('inactive');
  });
});
