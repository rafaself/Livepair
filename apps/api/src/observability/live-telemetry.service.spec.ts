import type { LiveTelemetryEvent } from '@livepair/shared-types';
import { LiveTelemetryService } from './live-telemetry.service';

function parseLoggedEntries(spy: jest.SpyInstance): Array<Record<string, unknown>> {
  return spy.mock.calls.map(([entry]) => JSON.parse(entry as string) as Record<string, unknown>);
}

describe('LiveTelemetryService', () => {
  let consoleInfoSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  function createBaseEvent(
    overrides: Partial<LiveTelemetryEvent>,
  ): Omit<LiveTelemetryEvent, 'eventType'> {
    return {
      occurredAt: '2026-03-16T14:00:00.000Z',
      sessionId: 'session-1',
      chatId: 'chat-1',
      environment: 'test',
      platform: 'linux',
      appVersion: '0.0.1',
      model: 'models/gemini',
      ...overrides,
    };
  }

  it('emits one structured JSON log per accepted event with severity routing', () => {
    const service = new LiveTelemetryService();
    const events: LiveTelemetryEvent[] = [
      {
        eventType: 'live_session_started',
        ...createBaseEvent({}),
      },
      {
        eventType: 'live_session_error',
        ...createBaseEvent({ occurredAt: '2026-03-16T14:01:00.000Z' }),
        errorCode: 'transport_closed',
        errorMessage: 'WebSocket closed unexpectedly',
      },
      {
        eventType: 'live_session_ended',
        ...createBaseEvent({ occurredAt: '2026-03-16T14:02:00.000Z' }),
        durationMs: 120000,
        firstResponseLatencyMs: 850,
        resumeCount: 1,
        interruptionCount: 2,
        closeReason: 'user_stop',
      },
    ];

    service.acceptBatch(events);

    expect(consoleInfoSpy).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(parseLoggedEntries(consoleInfoSpy)).toEqual([
      {
        severity: 'INFO',
        message: 'Accepted Gemini Live telemetry event',
        component: 'live-telemetry',
        eventType: 'live_session_started',
        sessionId: 'session-1',
        chatId: 'chat-1',
        environment: 'test',
        platform: 'linux',
        appVersion: '0.0.1',
        model: 'models/gemini',
      },
      {
        severity: 'INFO',
        message: 'Accepted Gemini Live telemetry event',
        component: 'live-telemetry',
        eventType: 'live_session_ended',
        sessionId: 'session-1',
        chatId: 'chat-1',
        environment: 'test',
        platform: 'linux',
        appVersion: '0.0.1',
        model: 'models/gemini',
        firstResponseLatencyMs: 850,
        durationMs: 120000,
        resumeCount: 1,
        interruptionCount: 2,
        closeReason: 'user_stop',
      },
    ]);
    expect(parseLoggedEntries(consoleErrorSpy)).toEqual([
      {
        severity: 'ERROR',
        message: 'Accepted Gemini Live telemetry event',
        component: 'live-telemetry',
        eventType: 'live_session_error',
        sessionId: 'session-1',
        chatId: 'chat-1',
        environment: 'test',
        platform: 'linux',
        appVersion: '0.0.1',
        model: 'models/gemini',
        errorCode: 'transport_closed',
        errorMessage: 'WebSocket closed unexpectedly',
      },
    ]);
  });

  it('keeps usage logs compact and only includes present summary fields', () => {
    const service = new LiveTelemetryService();
    const events: LiveTelemetryEvent[] = [
      {
        eventType: 'live_usage_reported',
        ...createBaseEvent({}),
        usage: {
          totalTokenCount: 120,
          responseTokenCount: 80,
          responseTokensDetails: [
            {
              modality: 'audio',
              tokenCount: 40,
            },
          ],
        },
      },
    ];

    service.acceptBatch(events);

    expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(parseLoggedEntries(consoleInfoSpy)).toEqual([
      {
        severity: 'INFO',
        message: 'Accepted Gemini Live telemetry event',
        component: 'live-telemetry',
        eventType: 'live_usage_reported',
        sessionId: 'session-1',
        chatId: 'chat-1',
        environment: 'test',
        platform: 'linux',
        appVersion: '0.0.1',
        model: 'models/gemini',
        usage: {
          totalTokenCount: 120,
          responseTokenCount: 80,
          responseTokensDetails: [
            {
              modality: 'audio',
              tokenCount: 40,
            },
          ],
        },
      },
    ]);
  });
});
