import { describe, expect, it, vi } from 'vitest';
import { createDefaultRealtimeOutboundDiagnostics } from '../../outbound/realtimeOutboundGateway';
import type {
  RealtimeOutboundDecision,
  RealtimeOutboundEvent,
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
import type { ScreenOutboundFrameRequest } from './screenFrameContracts';

function createOutboundRequest(sequence: number, fill = sequence): ScreenOutboundFrameRequest {
  return {
    frame: createScreenFrame(sequence, fill),
    requestedAtMs: Date.now(),
    mode: 'continuous',
    quality: 'medium',
    reason: 'base',
  };
}

function createHarness(options: {
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
    submit: vi.fn((_event: RealtimeOutboundEvent) => {
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

  const onFrameAccepted = vi.fn();
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
    onFrameAccepted,
    onFrameBlockedByGateway,
    flushVisualDiagnostics,
    onSendStarted,
    onSendSucceeded,
    onSendFailed,
  });

  return {
    controllerState,
    coordinator,
    gateway,
    onFrameAccepted,
    onFrameBlockedByGateway,
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

    await harness.coordinator.enqueueFrameSend(createOutboundRequest(1));

    expect(harness.gateway.submit).not.toHaveBeenCalled();
    expect(harness.sendVideoFrame).not.toHaveBeenCalled();
  });

  it('no-ops when there is no active transport', async () => {
    const harness = createHarness();
    harness.setTransport(null);

    await harness.coordinator.enqueueFrameSend(createOutboundRequest(1));

    expect(harness.gateway.submit).not.toHaveBeenCalled();
    expect(harness.sendVideoFrame).not.toHaveBeenCalled();
  });

  it('submits accepted frames to the gateway and active transport', async () => {
    const harness = createHarness();
    const request = createOutboundRequest(4);

    await harness.coordinator.enqueueFrameSend(request);

    expect(harness.gateway.submit).toHaveBeenCalledWith({
      kind: 'visual_frame',
      channelKey: 'visual:screen',
      replaceKey: 'visual:screen',
      sequence: 1,
      createdAtMs: expect.any(Number),
      estimatedBytes: request.frame.data.byteLength,
    });
    expect(harness.onFrameAccepted).toHaveBeenCalledWith(request);
    expect(harness.flushVisualDiagnostics).toHaveBeenCalledTimes(1);
    expect(harness.onSendStarted).toHaveBeenCalledTimes(1);
    expect(harness.sendVideoFrame).toHaveBeenCalledWith(request.frame.data, request.frame.mimeType);
    expect(harness.gateway.recordSuccess).toHaveBeenCalledTimes(1);
    expect(harness.onSendSucceeded).toHaveBeenCalledWith(request);
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

    await harness.coordinator.enqueueFrameSend(createOutboundRequest(5));

    expect(harness.gateway.submit).toHaveBeenCalledTimes(1);
    expect(harness.onFrameBlockedByGateway).toHaveBeenCalledTimes(1);
    expect(harness.flushVisualDiagnostics).toHaveBeenCalledTimes(1);
    expect(harness.onFrameAccepted).not.toHaveBeenCalled();
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

    const first = harness.coordinator.enqueueFrameSend(createOutboundRequest(6, 1));
    await Promise.resolve();
    const second = harness.coordinator.enqueueFrameSend(createOutboundRequest(7, 2));
    const third = harness.coordinator.enqueueFrameSend(createOutboundRequest(8, 3));

    firstSend.resolve();
    await Promise.all([first, second, third]);

    expect(harness.gateway.submit).toHaveBeenCalledTimes(3);
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(2);
    expect(harness.sendVideoFrame.mock.calls[0]?.[0]).toEqual(
      createScreenFrame(6, 1).data,
    );
    expect(harness.sendVideoFrame.mock.calls[1]?.[0]).toEqual(
      createScreenFrame(8, 3).data,
    );
  });

  it('reports active send failures and stops draining the current queue', async () => {
    const harness = createHarness();
    harness.sendVideoFrame.mockRejectedValueOnce(new Error('frame upload failed'));

    await harness.coordinator.enqueueFrameSend(createOutboundRequest(12, 7));

    expect(harness.gateway.recordFailure).toHaveBeenCalledWith('frame upload failed');
    expect(harness.onSendFailed).toHaveBeenCalledWith('frame upload failed');
    expect(harness.gateway.recordSuccess).not.toHaveBeenCalled();
    expect(harness.onSendSucceeded).not.toHaveBeenCalled();
  });
});
