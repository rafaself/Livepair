import { describe, expect, it } from 'vitest';
import {
  createTextSessionLifecycle,
  reduceTextSessionLifecycle,
  type TextSessionLifecycleEvent,
} from './textSessionLifecycle';

function applyEvents(events: TextSessionLifecycleEvent[]) {
  return events.reduce(
    (lifecycle, event) => reduceTextSessionLifecycle(lifecycle, event),
    createTextSessionLifecycle(),
  );
}

describe('textSessionLifecycle', () => {
  it('tracks the happy-path lifecycle from connect through generation and turn completion', () => {
    const lifecycle = applyEvents([
      { type: 'bootstrap.started' },
      { type: 'transport.connected' },
      { type: 'submit.started' },
      { type: 'response.delta.received' },
      { type: 'response.generation.completed' },
      { type: 'response.turn.completed' },
    ]);

    expect(lifecycle.status).toBe('completed');
  });

  it('keeps interrupted turns explicit until turn completion arrives', () => {
    const lifecycle = applyEvents([
      { type: 'bootstrap.started' },
      { type: 'transport.connected' },
      { type: 'submit.started' },
      { type: 'response.delta.received' },
      { type: 'response.interrupted' },
    ]);

    expect(lifecycle.status).toBe('interrupted');

    expect(
      reduceTextSessionLifecycle(lifecycle, {
        type: 'response.turn.completed',
      }).status,
    ).toBe('completed');
  });

  it('treats go-away as a first-class terminal state and ignores later failures for the same session', () => {
    const lifecycle = applyEvents([
      { type: 'bootstrap.started' },
      { type: 'transport.connected' },
      { type: 'go-away.received' },
    ]);

    expect(lifecycle.status).toBe('goAway');
    expect(reduceTextSessionLifecycle(lifecycle, { type: 'runtime.failed' })).toBe(
      lifecycle,
    );
    expect(
      reduceTextSessionLifecycle(lifecycle, {
        type: 'transport.disconnected',
      }),
    ).toBe(lifecycle);
  });

  it('tracks explicit disconnect requests separately from final disconnection', () => {
    const disconnectingLifecycle = applyEvents([
      { type: 'bootstrap.started' },
      { type: 'transport.connected' },
      { type: 'disconnect.requested' },
    ]);

    expect(disconnectingLifecycle.status).toBe('disconnecting');
    expect(
      reduceTextSessionLifecycle(disconnectingLifecycle, {
        type: 'transport.disconnected',
      }).status,
    ).toBe('disconnected');
  });

  it('moves bootstrap failures into error', () => {
    const lifecycle = reduceTextSessionLifecycle(createTextSessionLifecycle(), {
      type: 'runtime.failed',
    });

    expect(lifecycle.status).toBe('error');
  });

  it('allows a fresh reconnect after disconnected and error terminal states', () => {
    const disconnectedLifecycle = applyEvents([
      { type: 'bootstrap.started' },
      { type: 'transport.connected' },
      { type: 'disconnect.requested' },
      { type: 'transport.disconnected' },
    ]);
    const errorLifecycle = reduceTextSessionLifecycle(createTextSessionLifecycle(), {
      type: 'runtime.failed',
    });

    expect(
      reduceTextSessionLifecycle(disconnectedLifecycle, {
        type: 'bootstrap.started',
      }).status,
    ).toBe('connecting');
    expect(
      reduceTextSessionLifecycle(errorLifecycle, {
        type: 'bootstrap.started',
      }).status,
    ).toBe('connecting');
  });
});
