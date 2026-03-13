import { describe, expect, it, vi } from 'vitest';
import { createVoiceInterruptionController } from './voiceInterruptionController';
import type { DesktopSession } from '../transport/transport.types';
import type { VoiceCaptureState, VoiceSessionStatus } from './voice.types';

function createHarness(options: { captureState?: VoiceCaptureState } = {}) {
  const { captureState = 'idle' } = options;
  let currentCaptureState: VoiceCaptureState = captureState;

  const setAssistantActivity = vi.fn();
  const store = {
    getState: () => ({
      voiceCaptureState: currentCaptureState,
      setAssistantActivity,
    }),
  };

  const transport = { fake: true } as unknown as DesktopSession;
  let currentTransport: DesktopSession | null = transport;
  let currentStatus: VoiceSessionStatus = 'ready';

  const setVoiceSessionStatus = vi.fn((s: VoiceSessionStatus) => {
    currentStatus = s;
  });
  const applySpeechLifecycleEvent = vi.fn();
  const stopPlayback = vi.fn(() => Promise.resolve());

  const ctrl = createVoiceInterruptionController(
    store,
    () => currentTransport,
    () => currentStatus,
    setVoiceSessionStatus,
    applySpeechLifecycleEvent,
    stopPlayback,
  );

  return {
    ctrl,
    setAssistantActivity,
    setVoiceSessionStatus,
    applySpeechLifecycleEvent,
    stopPlayback,
    setTransport: (t: DesktopSession | null) => { currentTransport = t; },
    setStatus: (s: VoiceSessionStatus) => { currentStatus = s; },
    setCaptureState: (s: VoiceCaptureState) => { currentCaptureState = s; },
  };
}

describe('createVoiceInterruptionController', () => {
  it('sets status to interrupted and emits lifecycle event', async () => {
    const h = createHarness();

    h.ctrl.handle();
    await vi.waitFor(() => {
      expect(h.setVoiceSessionStatus).toHaveBeenCalledWith('interrupted');
    });
    expect(h.applySpeechLifecycleEvent).toHaveBeenCalledWith({
      type: 'interruption.detected',
    });
  });

  it('sets assistant activity to idle', async () => {
    const h = createHarness();

    h.ctrl.handle();
    await vi.waitFor(() => {
      expect(h.setAssistantActivity).toHaveBeenCalledWith('idle');
    });
  });

  it('stops playback during interruption', async () => {
    const h = createHarness();

    h.ctrl.handle();
    await vi.waitFor(() => {
      expect(h.stopPlayback).toHaveBeenCalled();
    });
  });

  it('deduplicates concurrent handle calls', async () => {
    const h = createHarness();

    h.ctrl.handle();
    h.ctrl.handle();
    h.ctrl.handle();

    await vi.waitFor(() => {
      expect(h.stopPlayback).toHaveBeenCalledTimes(1);
    });
  });

  it('transitions to recovering when capturing', async () => {
    const h = createHarness({ captureState: 'capturing' });

    h.ctrl.handle();
    await vi.waitFor(() => {
      expect(h.setVoiceSessionStatus).toHaveBeenCalledWith('recovering');
      expect(h.applySpeechLifecycleEvent).toHaveBeenCalledWith({
        type: 'recovery.started',
      });
    });
  });

  it('transitions to ready when not capturing', async () => {
    const h = createHarness({ captureState: 'idle' });

    h.ctrl.handle();
    await vi.waitFor(() => {
      expect(h.setVoiceSessionStatus).toHaveBeenCalledWith('ready');
      expect(h.applySpeechLifecycleEvent).toHaveBeenCalledWith({
        type: 'recovery.completed',
      });
    });
  });

  it('aborts recovery when transport is lost', async () => {
    const h = createHarness();
    h.setTransport(null);

    h.ctrl.handle();
    await vi.waitFor(() => {
      expect(h.stopPlayback).toHaveBeenCalled();
    });

    // Should NOT transition to ready/recovering since transport is null
    const readyCalls = h.setVoiceSessionStatus.mock.calls.filter(
      ([s]) => s === 'ready' || s === 'recovering',
    );
    expect(readyCalls).toHaveLength(0);
  });

  it('aborts recovery when status changed externally', async () => {
    const h = createHarness();

    h.ctrl.handle();
    // Change status before playback stop resolves
    h.setStatus('error');

    await vi.waitFor(() => {
      expect(h.stopPlayback).toHaveBeenCalled();
    });

    const readyCalls = h.setVoiceSessionStatus.mock.calls.filter(
      ([s]) => s === 'ready' || s === 'recovering',
    );
    expect(readyCalls).toHaveLength(0);
  });

  it('reset invalidates in-flight handler', async () => {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => { resolve = r; });
    const h = createHarness();
    h.stopPlayback.mockReturnValue(promise);

    h.ctrl.handle();
    h.ctrl.reset();
    resolve();

    await promise;

    // Should NOT transition after reset
    const postInterruptCalls = h.setVoiceSessionStatus.mock.calls.filter(
      ([s]) => s === 'ready' || s === 'recovering',
    );
    expect(postInterruptCalls).toHaveLength(0);
  });

  it('ignores playback stop errors', async () => {
    const h = createHarness();
    h.stopPlayback.mockRejectedValue(new Error('playback error'));

    h.ctrl.handle();

    await vi.waitFor(() => {
      // Should still transition despite playback error
      expect(h.setVoiceSessionStatus).toHaveBeenCalledWith('ready');
    });
  });
});
