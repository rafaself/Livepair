import { describe, expect, it } from 'vitest';
import { createRealtimeOutboundGateway } from './realtimeOutboundGateway';
import type { RealtimeOutboundEvent } from './outbound.types';

function createTextEvent(
  overrides: Partial<Extract<RealtimeOutboundEvent, { kind: 'text' }>> = {},
): Extract<RealtimeOutboundEvent, { kind: 'text' }> {
  return {
    kind: 'text',
    channelKey: 'text:composer',
    sequence: 1,
    createdAtMs: 1_000,
    estimatedBytes: 24,
    ...overrides,
  };
}

function createAudioChunkEvent(
  overrides: Partial<Extract<RealtimeOutboundEvent, { kind: 'audio_chunk' }>> = {},
): Extract<RealtimeOutboundEvent, { kind: 'audio_chunk' }> {
  return {
    kind: 'audio_chunk',
    channelKey: 'audio:mic',
    sequence: 1,
    createdAtMs: 2_000,
    estimatedBytes: 640,
    ...overrides,
  };
}

function createVisualFrameEvent(
  overrides: Partial<Extract<RealtimeOutboundEvent, { kind: 'visual_frame' }>> = {},
): Extract<RealtimeOutboundEvent, { kind: 'visual_frame' }> {
  return {
    kind: 'visual_frame',
    channelKey: 'visual:screen',
    replaceKey: 'screen:primary',
    sequence: 1,
    createdAtMs: 3_000,
    estimatedBytes: 12_000,
    ...overrides,
  };
}

describe('realtimeOutboundGateway', () => {
  it('accepts supported outbound event shapes via the public contract', () => {
    const gateway = createRealtimeOutboundGateway();

    const decision = gateway.submit(createTextEvent());

    expect(decision).toEqual({
      outcome: 'send',
      classification: 'non-replaceable',
      reason: 'accepted',
    });
    expect(gateway.getDiagnostics()).toMatchObject({
      breakerState: 'closed',
      totalSubmitted: 1,
      sentCount: 1,
      droppedCount: 0,
      replacedCount: 0,
      blockedCount: 0,
      lastDecision: 'send',
      lastEventKind: 'text',
      lastSequence: 1,
    });
  });

  it('classifies replaceable and non-replaceable events correctly', () => {
    const gateway = createRealtimeOutboundGateway();

    const audioDecision = gateway.submit(createAudioChunkEvent());
    const visualDecision = gateway.submit(createVisualFrameEvent());

    expect(audioDecision.classification).toBe('non-replaceable');
    expect(visualDecision.classification).toBe('replaceable');
  });

  it('bounds the audio lane to one in-flight and one pending chunk', () => {
    const gateway = createRealtimeOutboundGateway();

    expect(gateway.submit(createAudioChunkEvent({ sequence: 1 })).outcome).toBe('send');
    expect(gateway.submit(createAudioChunkEvent({ sequence: 2 })).outcome).toBe('send');
    expect(gateway.submit(createAudioChunkEvent({ sequence: 3 }))).toEqual({
      outcome: 'drop',
      classification: 'non-replaceable',
      reason: 'lane-saturated',
    });

    gateway.settle(createAudioChunkEvent({ sequence: 1 }));

    expect(gateway.submit(createAudioChunkEvent({ sequence: 4 })).outcome).toBe('send');
  });

  it('updates diagnostics for send, drop, replace, and block outcomes', () => {
    const gateway = createRealtimeOutboundGateway({ maxConsecutiveFailures: 2 });

    expect(gateway.submit(createTextEvent()).outcome).toBe('send');
    expect(gateway.submit(createTextEvent()).outcome).toBe('drop');
    expect(gateway.submit(createVisualFrameEvent()).outcome).toBe('send');
    expect(
      gateway.submit(createVisualFrameEvent({ sequence: 2, createdAtMs: 3_100 })).outcome,
    ).toBe('replace');

    gateway.recordFailure('transport unavailable');
    gateway.recordFailure('transport unavailable');

    expect(gateway.submit(createTextEvent({ sequence: 2, createdAtMs: 4_000 })).outcome).toBe(
      'block',
    );
    expect(gateway.getDiagnostics()).toMatchObject({
      breakerState: 'open',
      totalSubmitted: 5,
      sentCount: 2,
      droppedCount: 1,
      replacedCount: 1,
      blockedCount: 1,
      consecutiveFailureCount: 2,
      lastDecision: 'block',
      lastError: 'transport unavailable',
    });
  });

  it('trips and resets the minimal breaker state', () => {
    const gateway = createRealtimeOutboundGateway({ maxConsecutiveFailures: 2 });

    gateway.recordFailure('first');
    expect(gateway.getDiagnostics().breakerState).toBe('closed');

    gateway.recordFailure('second');
    expect(gateway.getDiagnostics().breakerState).toBe('open');
    expect(gateway.submit(createTextEvent()).outcome).toBe('block');

    gateway.reset();

    expect(gateway.getDiagnostics()).toMatchObject({
      breakerState: 'closed',
      consecutiveFailureCount: 0,
      totalSubmitted: 0,
      sentCount: 0,
      droppedCount: 0,
      replacedCount: 0,
      blockedCount: 0,
      lastDecision: null,
      lastError: null,
    });
    expect(gateway.submit(createTextEvent()).outcome).toBe('send');
  });
});
