import { describe, expect, it, vi } from 'vitest';
import { createVoiceInterruptionController } from './voiceInterruptionController';
import type { DesktopSession } from '../../transport/transport.types';
import type { VoiceCaptureState, VoiceSessionStatus } from '../voice.types';

function createHarness(options: { captureState?: VoiceCaptureState } = {}) {
  const { captureState = 'inactive' } = options;
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
  let currentStatus: VoiceSessionStatus = 'interrupted';

  const applySessionEvent = vi.fn((event: { type: 'turn.recovery.started' | 'turn.recovery.completed' }) => {
    currentStatus = event.type === 'turn.recovery.started' ? 'recovering' : 'active';
  });
  const stopPlayback = vi.fn(() => Promise.resolve());

  const ctrl = createVoiceInterruptionController(
    store,
    () => currentTransport,
    () => currentStatus,
    applySessionEvent,
    stopPlayback,
  );

  return {
    ctrl,
    setAssistantActivity,
    applySessionEvent,
    stopPlayback,
    setTransport: (t: DesktopSession | null) => { currentTransport = t; },
    setStatus: (s: VoiceSessionStatus) => { currentStatus = s; },
    setCaptureState: (s: VoiceCaptureState) => { currentCaptureState = s; },
  };
}

describe('createVoiceInterruptionController', () => {
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
      expect(h.applySessionEvent).toHaveBeenCalledWith({
        type: 'turn.recovery.started',
      });
    });
  });

  it('transitions to active when not capturing', async () => {
    const h = createHarness({ captureState: 'muted' });

    h.ctrl.handle();
    await vi.waitFor(() => {
      expect(h.applySessionEvent).toHaveBeenCalledWith({
        type: 'turn.recovery.completed',
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

    // Should NOT transition to active/recovering since transport is null
    const activeCalls = h.applySessionEvent.mock.calls.filter(
      ([event]) => event.type === 'turn.recovery.completed' || event.type === 'turn.recovery.started',
    );
    expect(activeCalls).toHaveLength(0);
  });

  it('aborts recovery when status changed externally', async () => {
    const h = createHarness();

    h.ctrl.handle();
    // Change status before playback stop resolves
    h.setStatus('error');

    await vi.waitFor(() => {
      expect(h.stopPlayback).toHaveBeenCalled();
    });

    const activeCalls = h.applySessionEvent.mock.calls.filter(
      ([event]) => event.type === 'turn.recovery.completed' || event.type === 'turn.recovery.started',
    );
    expect(activeCalls).toHaveLength(0);
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
    const postInterruptCalls = h.applySessionEvent.mock.calls.filter(
      ([event]) => event.type === 'turn.recovery.completed' || event.type === 'turn.recovery.started',
    );
    expect(postInterruptCalls).toHaveLength(0);
  });

  it('ignores playback stop errors', async () => {
    const h = createHarness();
    h.stopPlayback.mockRejectedValue(new Error('playback error'));

    h.ctrl.handle();

    await vi.waitFor(() => {
      // Should still transition despite playback error
      expect(h.applySessionEvent).toHaveBeenCalledWith({
        type: 'turn.recovery.completed',
      });
    });
  });
});
