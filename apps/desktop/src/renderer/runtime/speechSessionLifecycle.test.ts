import { describe, expect, it } from 'vitest';
import {
  createSpeechSessionLifecycle,
  reduceSpeechSessionLifecycle,
  type SpeechSessionLifecycleEvent,
} from './speechSessionLifecycle';

function applyEvents(events: SpeechSessionLifecycleEvent[]) {
  return events.reduce(
    (lifecycle, event) => reduceSpeechSessionLifecycle(lifecycle, event),
    createSpeechSessionLifecycle(),
  );
}

describe('speechSessionLifecycle', () => {
  it('tracks the happy-path lifecycle from speech start through assistant completion', () => {
    const lifecycle = applyEvents([
      { type: 'session.start.requested' },
      { type: 'session.ready' },
      { type: 'user.speech.detected' },
      { type: 'assistant.output.started' },
      { type: 'assistant.turn.completed' },
    ]);

    expect(lifecycle.status).toBe('listening');
  });

  it('keeps interruption and recovery explicit before returning to listening', () => {
    const lifecycle = applyEvents([
      { type: 'session.start.requested' },
      { type: 'session.ready' },
      { type: 'assistant.output.started' },
      { type: 'interruption.detected' },
      { type: 'recovery.started' },
    ]);

    expect(lifecycle.status).toBe('recovering');
    expect(
      reduceSpeechSessionLifecycle(lifecycle, {
        type: 'recovery.completed',
      }).status,
    ).toBe('listening');
  });

  it('returns to userSpeaking when speech is detected during recovery', () => {
    const lifecycle = applyEvents([
      { type: 'session.start.requested' },
      { type: 'session.ready' },
      { type: 'assistant.output.started' },
      { type: 'interruption.detected' },
      { type: 'recovery.started' },
      { type: 'user.speech.detected' },
    ]);

    expect(lifecycle.status).toBe('userSpeaking');
  });

  it('tracks controlled shutdown separately from the final off state', () => {
    const endingLifecycle = applyEvents([
      { type: 'session.start.requested' },
      { type: 'session.ready' },
      { type: 'session.end.requested' },
    ]);

    expect(endingLifecycle.status).toBe('ending');
    expect(
      reduceSpeechSessionLifecycle(endingLifecycle, {
        type: 'session.ended',
      }).status,
    ).toBe('off');
  });

  it('ignores illegal transitions', () => {
    const lifecycle = createSpeechSessionLifecycle();

    expect(
      reduceSpeechSessionLifecycle(lifecycle, {
        type: 'assistant.output.started',
      }),
    ).toBe(lifecycle);
  });
});
