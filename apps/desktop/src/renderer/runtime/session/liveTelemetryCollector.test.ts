import { describe, expect, it, vi } from 'vitest';
import type { LiveTelemetryEvent } from '@livepair/shared-types';
import { createLiveTelemetryCollector } from './liveTelemetryCollector';

function flattenEvents(batches: LiveTelemetryEvent[][]): LiveTelemetryEvent[] {
  return batches.flatMap((batch) => batch);
}

describe('createLiveTelemetryCollector', () => {
  it('emits a small set of summarized session milestones with consolidated usage', () => {
    const emitted: LiveTelemetryEvent[][] = [];
    const emit = vi.fn((events: LiveTelemetryEvent[]) => {
      emitted.push(events);
      return Promise.resolve();
    });
    const nowValues = [
      Date.parse('2026-03-16T14:00:00.000Z'),
      Date.parse('2026-03-16T14:00:00.180Z'),
      Date.parse('2026-03-16T14:00:00.450Z'),
      Date.parse('2026-03-16T14:00:00.700Z'),
      Date.parse('2026-03-16T14:00:01.000Z'),
      Date.parse('2026-03-16T14:00:01.400Z'),
    ];
    const collector = createLiveTelemetryCollector({
      emit,
      now: () => {
        const next = nowValues.shift();

        if (typeof next !== 'number') {
          throw new Error('No more clock values');
        }

        return next;
      },
    });

    collector.onSessionStarted({
      appVersion: '0.0.1',
      chatId: 'chat-1',
      environment: 'test',
      model: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
      platform: 'linux',
      sessionId: 'live-session-1',
    });
    collector.onSessionConnected();
    collector.onSessionResumed();
    collector.onUsageMetadata({
      totalTokenCount: 9,
      promptTokenCount: 4,
      inputTokenCount: 4,
      responseTokensDetails: [
        { modality: 'TEXT', tokenCount: 5 },
      ],
    });
    collector.onUsageMetadata({
      totalTokenCount: 7,
      responseTokenCount: 7,
      outputTokenCount: 7,
      responseTokensDetails: [
        { modality: 'TEXT', tokenCount: 3 },
        { modality: 'AUDIO', tokenCount: 4 },
      ],
    });
    collector.onInterruption();
    collector.onResponseStarted();
    collector.onSessionError({
      errorCode: 'GO_AWAY',
      errorMessage: 'Gemini Live requested reconnect',
    });
    collector.onSessionEnded({
      closeReason: 'session completed',
    });

    expect(flattenEvents(emitted)).toEqual([
      {
        eventType: 'live_session_started',
        occurredAt: '2026-03-16T14:00:00.000Z',
        sessionId: 'live-session-1',
        chatId: 'chat-1',
        environment: 'test',
        platform: 'linux',
        appVersion: '0.0.1',
        model: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
      },
      {
        eventType: 'live_session_connected',
        occurredAt: '2026-03-16T14:00:00.180Z',
        sessionId: 'live-session-1',
        chatId: 'chat-1',
        environment: 'test',
        platform: 'linux',
        appVersion: '0.0.1',
        model: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
        connectLatencyMs: 180,
      },
      {
        eventType: 'live_session_resumed',
        occurredAt: '2026-03-16T14:00:00.450Z',
        sessionId: 'live-session-1',
        chatId: 'chat-1',
        environment: 'test',
        platform: 'linux',
        appVersion: '0.0.1',
        model: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
        connectLatencyMs: 450,
        resumeCount: 1,
      },
      {
        eventType: 'live_session_error',
        occurredAt: '2026-03-16T14:00:01.000Z',
        sessionId: 'live-session-1',
        chatId: 'chat-1',
        environment: 'test',
        platform: 'linux',
        appVersion: '0.0.1',
        model: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
        errorCode: 'GO_AWAY',
        errorMessage: 'Gemini Live requested reconnect',
      },
      {
        eventType: 'live_usage_reported',
        occurredAt: '2026-03-16T14:00:01.400Z',
        sessionId: 'live-session-1',
        chatId: 'chat-1',
        environment: 'test',
        platform: 'linux',
        appVersion: '0.0.1',
        model: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
        usage: {
          totalTokenCount: 16,
          promptTokenCount: 4,
          responseTokenCount: 7,
          inputTokenCount: 4,
          outputTokenCount: 7,
          responseTokensDetails: [
            { modality: 'TEXT', tokenCount: 8 },
            { modality: 'AUDIO', tokenCount: 4 },
          ],
        },
      },
      {
        eventType: 'live_session_ended',
        occurredAt: '2026-03-16T14:00:01.400Z',
        sessionId: 'live-session-1',
        chatId: 'chat-1',
        environment: 'test',
        platform: 'linux',
        appVersion: '0.0.1',
        model: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
        firstResponseLatencyMs: 700,
        durationMs: 1400,
        resumeCount: 1,
        interruptionCount: 1,
        closeReason: 'session completed',
      },
    ]);
    expect(emit).toHaveBeenCalledTimes(5);
  });

  it('keeps telemetry best-effort when the emitter rejects and ignores calls without an active session', async () => {
    const emit = vi.fn().mockRejectedValue(new Error('backend unavailable'));
    const collector = createLiveTelemetryCollector({
      emit,
      now: () => Date.parse('2026-03-16T15:00:00.000Z'),
    });

    expect(() => collector.onSessionConnected()).not.toThrow();
    collector.onSessionStarted({
      appVersion: '0.0.1',
      chatId: 'chat-1',
      environment: 'test',
      model: 'models/gemini',
      platform: 'linux',
      sessionId: 'live-session-2',
    });

    expect(() =>
      collector.onSessionError({
        errorMessage: 'socket closed',
      })
    ).not.toThrow();
    expect(() =>
      collector.onSessionEnded({
        closeReason: 'socket closed',
      })
    ).not.toThrow();

    await Promise.resolve();

    expect(emit).toHaveBeenCalled();
  });
});
