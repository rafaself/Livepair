import { describe, expect, it, vi } from 'vitest';
import { createSessionTransportActivation } from './sessionTransportActivation';

describe('createSessionTransportActivation', () => {
  it('cleans up the current transport before activating and subscribing the next one', () => {
    const steps: string[] = [];
    const cleanupTransport = vi.fn(() => {
      steps.push('cleanup');
    });
    const setActiveTransport = vi.fn(() => {
      steps.push('set-active');
    });
    const subscribeTransport = vi.fn(() => {
      steps.push('subscribe');
    });
    const transport = { kind: 'gemini-live' } as never;
    const listener = vi.fn() as never;
    const { activateTransport } = createSessionTransportActivation({
      cleanupTransport,
      setActiveTransport,
      subscribeTransport,
    });

    activateTransport(transport, listener);

    expect(cleanupTransport).toHaveBeenCalledTimes(1);
    expect(setActiveTransport).toHaveBeenCalledWith(transport);
    expect(subscribeTransport).toHaveBeenCalledWith(transport, listener);
    expect(steps).toEqual(['cleanup', 'set-active', 'subscribe']);
  });
});
