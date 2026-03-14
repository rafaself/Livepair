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
    const policy = createVisualSendPolicy();
    policy.onScreenShareStarted();
    policy.analyzeScreenNow();
    policy.allowSend(); // consume → sleep
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
