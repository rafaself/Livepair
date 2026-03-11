import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createSpeechSilenceController } from './speechSilenceController';
import type { SpeechSilenceTimeoutSetting } from './speechSilenceTimeout';

describe('createSpeechSilenceController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createHarness(timeout: SpeechSilenceTimeoutSetting = '30s') {
    const onTimeout = vi.fn();
    const onRecoveryComplete = vi.fn();
    const settingsStore = {
      getState: () => ({
        settings: { speechSilenceTimeout: timeout },
      }),
    };
    const ctrl = createSpeechSilenceController(settingsStore, onTimeout, onRecoveryComplete);
    return { ctrl, onTimeout, onRecoveryComplete };
  }

  it('arms silence timeout when status is listening', () => {
    const { ctrl, onTimeout } = createHarness('30s');

    ctrl.syncTimeout('listening');
    vi.advanceTimersByTime(30_000);

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('does not arm timeout for non-listening status', () => {
    const { ctrl, onTimeout } = createHarness('30s');

    ctrl.syncTimeout('assistantSpeaking');
    vi.advanceTimersByTime(60_000);

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('does not arm timeout when setting is never', () => {
    const { ctrl, onTimeout } = createHarness('never');

    ctrl.syncTimeout('listening');
    vi.advanceTimersByTime(600_000);

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('clears previous timeout on new syncTimeout call', () => {
    const { ctrl, onTimeout } = createHarness('30s');

    ctrl.syncTimeout('listening');
    vi.advanceTimersByTime(20_000);
    ctrl.syncTimeout('listening');
    vi.advanceTimersByTime(20_000);

    // Only 20s into second timer, should not have fired
    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(10_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('handleStatusChange arms recovery timer for recovering status', () => {
    const { ctrl, onRecoveryComplete } = createHarness();

    ctrl.handleStatusChange('recovering');
    vi.advanceTimersByTime(0);

    expect(onRecoveryComplete).toHaveBeenCalledTimes(1);
  });

  it('handleStatusChange clears recovery timer for non-recovering status', () => {
    const { ctrl, onRecoveryComplete } = createHarness();

    ctrl.handleStatusChange('recovering');
    ctrl.handleStatusChange('listening');
    vi.advanceTimersByTime(0);

    // Recovery was cleared before it could fire, but a new one was not armed
    // The 'recovering' timer was cleared when 'listening' was set
    expect(onRecoveryComplete).not.toHaveBeenCalled();
  });

  it('handleStatusChange also syncs silence timeout', () => {
    const { ctrl, onTimeout } = createHarness('30s');

    ctrl.handleStatusChange('listening');
    vi.advanceTimersByTime(30_000);

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('clearAll cancels both timers', () => {
    const { ctrl, onTimeout, onRecoveryComplete } = createHarness('30s');

    ctrl.handleStatusChange('listening');
    ctrl.handleStatusChange('recovering');
    ctrl.clearAll();
    vi.advanceTimersByTime(60_000);

    expect(onTimeout).not.toHaveBeenCalled();
    expect(onRecoveryComplete).not.toHaveBeenCalled();
  });
});
