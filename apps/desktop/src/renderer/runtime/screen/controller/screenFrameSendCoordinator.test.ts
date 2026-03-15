import { describe, expect, it, vi } from 'vitest';
import { createDefaultRealtimeOutboundDiagnostics } from '../../outbound/realtimeOutboundGateway';
import type {
  RealtimeOutboundDecision,
  RealtimeOutboundGateway,
} from '../../outbound/outbound.types';
import type { DesktopSession } from '../../transport/transport.types';
import { createScreenCaptureControllerState } from './screenCaptureControllerState';
import {
  createDeferred,
  createMockScreenCapture,
  createScreenFrame,
  createTransportMock,
} from './controllerTestUtils';
import { createScreenFrameSendCoordinator } from './screenFrameSendCoordinator';

function createHarness(options: {
  allowSend?: boolean;
  shouldSendFrame?: (frame: ReturnType<typeof createScreenFrame>) => boolean;
  submitDecision?: (callIndex: number) => RealtimeOutboundDecision;
} = {}) {
  const controllerState = createScreenCaptureControllerState();
  const capture = createMockScreenCapture();
  const generation = controllerState.getNextCaptureGeneration();
  controllerState.setCapture(capture, generation);

  const { transport, sendVideoFrame } = createTransportMock();
  let currentTransport: DesktopSession | null = transport;
  let submitCount = 0;

  const gateway: RealtimeOutboundGateway = {
    submit: vi.fn(() => {
      submitCount += 1;
      return options.submitDecision?.(submitCount) ?? {
        outcome: 'send',
        classification: 'replaceable',
        reason: 'accepted',
      } satisfies RealtimeOutboundDecision;
    }),
    settle: vi.fn(),
    recordFailure: vi.fn(),
    recordSuccess: vi.fn(),
    reset: vi.fn(),
    getDiagnostics: vi.fn(createDefaultRealtimeOutboundDiagnostics),
  };

  const onFrameDispatched = vi.fn();
  const onFrameDroppedByPolicy = vi.fn();
  const onFrameBlockedByGateway = vi.fn();
  const flushVisualDiagnostics = vi.fn();
  const onSendStarted = vi.fn();
  const onSendSucceeded = vi.fn();
  const onSendFailed = vi.fn();

  const coordinator = createScreenFrameSendCoordinator({
    getActiveCapture: controllerState.getActiveCapture,
    isCurrentCapture: controllerState.isCurrentCapture,
    getTransport: () => currentTransport,
    getRealtimeOutboundGateway: () => gateway,
    allowSend: () => options.allowSend ?? true,
    onFrameDispatched,
    onFrameDroppedByPolicy,
    onFrameBlockedByGateway,
    ...(options.shouldSendFrame
      ? { shouldSendFrame: options.shouldSendFrame }
      : {}),
    flushVisualDiagnostics,
    onSendStarted,
    onSendSucceeded,
    onSendFailed,
  });

  return {
    controllerState,
    coordinator,
    gateway,
    onFrameBlockedByGateway,
    onFrameDispatched,
    onFrameDroppedByPolicy,
    onSendFailed,
    onSendStarted,
    onSendSucceeded,
    flushVisualDiagnostics,
    sendVideoFrame,
    setTransport: (nextTransport: DesktopSession | null) => {
      currentTransport = nextTransport;
    },
  };
}

describe('createScreenFrameSendCoordinator', () => {
  it('no-ops when there is no active capture', async () => {
    const harness = createHarness();
    harness.controllerState.clearCapture();

    await harness.coordinator.enqueueFrameSend(createScreenFrame(1));

    expect(harness.gateway.submit).not.toHaveBeenCalled();
    expect(harness.sendVideoFrame).not.toHaveBeenCalled();
  });

  it('no-ops when there is no active transport', async () => {
    const harness = createHarness();
    harness.setTransport(null);

    await harness.coordinator.enqueueFrameSend(createScreenFrame(1));

    expect(harness.gateway.submit).not.toHaveBeenCalled();
    expect(harness.sendVideoFrame).not.toHaveBeenCalled();
  });

  it('counts allowSend=false as dropped by policy', async () => {
    const harness = createHarness({ allowSend: false });

    await harness.coordinator.enqueueFrameSend(createScreenFrame(2));

    expect(harness.onFrameDroppedByPolicy).toHaveBeenCalledTimes(1);
    expect(harness.flushVisualDiagnostics).toHaveBeenCalledTimes(1);
    expect(harness.gateway.submit).not.toHaveBeenCalled();
    expect(harness.sendVideoFrame).not.toHaveBeenCalled();
  });

  it('treats shouldSendFrame=false as dropped by policy', async () => {
    const harness = createHarness({
      shouldSendFrame: () => false,
    });

    await harness.coordinator.enqueueFrameSend(createScreenFrame(3));

    expect(harness.onFrameDroppedByPolicy).toHaveBeenCalledTimes(1);
    expect(harness.flushVisualDiagnostics).toHaveBeenCalledTimes(1);
    expect(harness.gateway.submit).not.toHaveBeenCalled();
    expect(harness.sendVideoFrame).not.toHaveBeenCalled();
  });

  it('submits accepted frames to the gateway and active transport', async () => {
    const harness = createHarness();
    const frame = createScreenFrame(4);

    await harness.coordinator.enqueueFrameSend(frame);

    expect(harness.gateway.submit).toHaveBeenCalledWith({
      kind: 'visual_frame',
      channelKey: 'visual:screen',
      replaceKey: 'visual:screen',
      sequence: 1,
      createdAtMs: expect.any(Number),
      estimatedBytes: frame.data.byteLength,
    });
    expect(harness.onFrameDispatched).toHaveBeenCalledTimes(1);
    expect(harness.flushVisualDiagnostics).toHaveBeenCalledTimes(1);
    expect(harness.onSendStarted).toHaveBeenCalledTimes(1);
    expect(harness.sendVideoFrame).toHaveBeenCalledWith(frame.data, frame.mimeType);
    expect(harness.gateway.recordSuccess).toHaveBeenCalledTimes(1);
    expect(harness.onSendSucceeded).toHaveBeenCalledTimes(1);
    expect(harness.onSendFailed).not.toHaveBeenCalled();
  });

  it('does not dispatch frames when the gateway blocks them', async () => {
    const harness = createHarness({
      submitDecision: () => ({
        outcome: 'block',
        classification: 'replaceable',
        reason: 'breaker-open',
      }),
    });

    await harness.coordinator.enqueueFrameSend(createScreenFrame(5));

    expect(harness.gateway.submit).toHaveBeenCalledTimes(1);
    expect(harness.onFrameBlockedByGateway).toHaveBeenCalledTimes(1);
    expect(harness.flushVisualDiagnostics).toHaveBeenCalledTimes(1);
    expect(harness.onFrameDispatched).not.toHaveBeenCalled();
    expect(harness.sendVideoFrame).not.toHaveBeenCalled();
    expect(harness.gateway.recordSuccess).not.toHaveBeenCalled();
    expect(harness.gateway.recordFailure).not.toHaveBeenCalled();
  });

  it('keeps only the latest pending frame while a send is in flight', async () => {
    const harness = createHarness({
      submitDecision: (callIndex) => ({
        outcome: callIndex === 1 ? 'send' : 'replace',
        classification: 'replaceable',
        reason: callIndex === 1 ? 'accepted' : 'superseded-latest',
      }),
    });
    const firstSend = createDeferred<void>();

    harness.sendVideoFrame
      .mockImplementationOnce(() => firstSend.promise)
      .mockResolvedValueOnce(undefined);

    const first = harness.coordinator.enqueueFrameSend(createScreenFrame(6, 1));
    await Promise.resolve();
    const second = harness.coordinator.enqueueFrameSend(createScreenFrame(7, 2));
    const third = harness.coordinator.enqueueFrameSend(createScreenFrame(8, 3));

    firstSend.resolve();
    await Promise.all([first, second, third]);

    expect(harness.gateway.submit).toHaveBeenCalledTimes(3);
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(2);
    expect(harness.sendVideoFrame.mock.calls).toEqual([
      [expect.any(Uint8Array), 'image/jpeg'],
      [expect.any(Uint8Array), 'image/jpeg'],
    ]);
    expect(harness.sendVideoFrame.mock.calls[0]?.[0]).toEqual(
      createScreenFrame(6, 1).data,
    );
    expect(harness.sendVideoFrame.mock.calls[1]?.[0]).toEqual(
      createScreenFrame(8, 3).data,
    );
  });

  it('drops pending frames if the active transport changes before the next drain', async () => {
    const harness = createHarness();
    const nextTransport = createTransportMock();
    const firstSend = createDeferred<void>();

    harness.sendVideoFrame.mockImplementationOnce(() => firstSend.promise);

    const first = harness.coordinator.enqueueFrameSend(createScreenFrame(9, 4));
    await Promise.resolve();
    const second = harness.coordinator.enqueueFrameSend(createScreenFrame(10, 5));

    harness.setTransport(nextTransport.transport);
    firstSend.resolve();
    await Promise.all([first, second]);

    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(1);
    expect(nextTransport.sendVideoFrame).not.toHaveBeenCalled();
  });

  it('ignores send failures after the capture becomes stale', async () => {
    const harness = createHarness();
    const firstSend = createDeferred<void>();

    harness.sendVideoFrame.mockImplementationOnce(() => firstSend.promise);

    const sendPromise = harness.coordinator.enqueueFrameSend(createScreenFrame(11, 6));
    await Promise.resolve();
    harness.controllerState.clearCapture();
    firstSend.reject(new Error('frame upload failed after stop'));
    await sendPromise;

    expect(harness.gateway.recordFailure).not.toHaveBeenCalled();
    expect(harness.onSendFailed).not.toHaveBeenCalled();
  });

  it('reports active send failures and stops draining the current queue', async () => {
    const harness = createHarness();
    harness.sendVideoFrame.mockRejectedValueOnce(new Error('frame upload failed'));

    await harness.coordinator.enqueueFrameSend(createScreenFrame(12, 7));

    expect(harness.gateway.recordFailure).toHaveBeenCalledWith('frame upload failed');
    expect(harness.onSendFailed).toHaveBeenCalledWith('frame upload failed');
    expect(harness.gateway.recordSuccess).not.toHaveBeenCalled();
    expect(harness.onSendSucceeded).not.toHaveBeenCalled();
  });

  it('reset clears queued pending work and allows the next send to start fresh', async () => {
    const harness = createHarness();
    const firstSend = createDeferred<void>();

    harness.sendVideoFrame
      .mockImplementationOnce(() => firstSend.promise)
      .mockResolvedValueOnce(undefined);

    const first = harness.coordinator.enqueueFrameSend(createScreenFrame(13, 8));
    await Promise.resolve();
    const second = harness.coordinator.enqueueFrameSend(createScreenFrame(14, 9));

    harness.coordinator.reset();
    firstSend.resolve();
    await Promise.all([first, second]);

    await harness.coordinator.enqueueFrameSend(createScreenFrame(15, 10));

    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(2);
    expect(harness.sendVideoFrame.mock.calls[0]?.[0]).toEqual(
      createScreenFrame(13, 8).data,
    );
    expect(harness.sendVideoFrame.mock.calls[1]?.[0]).toEqual(
      createScreenFrame(15, 10).data,
    );
  });
});
