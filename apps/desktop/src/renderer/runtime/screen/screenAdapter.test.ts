import { describe, expect, it, vi } from 'vitest';
import { createLiveRuntimeScreenAdapter } from './screenAdapter';

describe('createLiveRuntimeScreenAdapter', () => {
  it('maps capture and runtime responsibilities onto narrow internal boundaries', async () => {
    const controller = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      stopInternal: vi.fn(async () => undefined),
      resetDiagnostics: vi.fn(),
      enqueueFrameSend: vi.fn(async () => undefined),
      isActive: vi.fn(() => true),
      resetSendChain: vi.fn(),
      analyzeScreenNow: vi.fn(),
    };

    const adapter = createLiveRuntimeScreenAdapter(controller);

    await adapter.capture.start();
    await adapter.capture.stop();
    adapter.capture.analyzeNow();
    expect(adapter.capture.isActive()).toBe(true);

    await adapter.runtime.stopCapture({ nextState: 'error' });
    adapter.runtime.handleTransportDetached();

    expect(controller.start).toHaveBeenCalledTimes(1);
    expect(controller.stop).toHaveBeenCalledTimes(1);
    expect(controller.analyzeScreenNow).toHaveBeenCalledTimes(1);
    expect(controller.stopInternal).toHaveBeenCalledWith({ nextState: 'error' });
    expect(controller.resetSendChain).toHaveBeenCalledTimes(1);
  });
});
