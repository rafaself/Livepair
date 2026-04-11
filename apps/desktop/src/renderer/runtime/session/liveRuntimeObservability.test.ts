import { describe, expect, it, vi } from 'vitest';
import type { LiveTelemetryEvent } from '@livepair/shared-types';
import { createLiveRuntimeObservability } from './liveRuntimeObservability';

describe('createLiveRuntimeObservability', () => {
  it('attaches session and turn correlation to runtime diagnostics', () => {
    const logDiagnostic = vi.fn();
    const logError = vi.fn();
    const observability = createLiveRuntimeObservability({
      emitTelemetry: vi.fn().mockResolvedValue(undefined),
      logDiagnostic,
      logError,
      getTurnId: () => 'voice-turn-7',
      now: () => Date.parse('2026-04-11T20:00:00.000Z'),
    });

    observability.onSessionStarted({
      appVersion: '0.0.1',
      chatId: 'chat-1',
      environment: 'test',
      model: 'models/gemini',
      platform: 'linux',
      sessionId: 'live-session-1',
    });

    observability.emitDiagnostic({
      scope: 'voice-session',
      name: 'resume requested',
      data: {
        latestHandle: 'handle-1',
      },
    });
    observability.onSessionError({
      detail: 'transport failed',
      errorCode: 'SOCKET_CLOSED',
    });

    expect(logDiagnostic).toHaveBeenCalledWith(
      'voice-session',
      'resume requested',
      expect.objectContaining({
        sessionId: 'live-session-1',
        chatId: 'chat-1',
        turnId: 'voice-turn-7',
        latestHandle: 'handle-1',
      }),
    );
    expect(logError).toHaveBeenCalledWith(
      'voice-session',
      'session-error',
      expect.objectContaining({
        sessionId: 'live-session-1',
        chatId: 'chat-1',
        turnId: 'voice-turn-7',
        detail: 'transport failed',
        errorCode: 'SOCKET_CLOSED',
      }),
    );
  });

  it('preserves the existing summarized session telemetry path', () => {
    const emitted: LiveTelemetryEvent[][] = [];
    const observability = createLiveRuntimeObservability({
      emitTelemetry: vi.fn(async (events: LiveTelemetryEvent[]) => {
        emitted.push(events);
      }),
      logDiagnostic: vi.fn(),
      logError: vi.fn(),
      now: (() => {
        const values = [
          Date.parse('2026-04-11T21:00:00.000Z'),
          Date.parse('2026-04-11T21:00:00.100Z'),
          Date.parse('2026-04-11T21:00:00.900Z'),
        ];
        return () => values.shift() ?? Date.parse('2026-04-11T21:00:01.100Z');
      })(),
    });

    observability.onSessionStarted({
      appVersion: '0.0.1',
      chatId: 'chat-1',
      environment: 'test',
      model: 'models/gemini',
      platform: 'linux',
      sessionId: 'live-session-1',
    });
    observability.onSessionConnected();
    observability.onSessionError({
      detail: 'socket closed',
    });
    observability.onSessionEnded({
      closeReason: 'socket closed',
    });

    expect(emitted.flat()).toEqual([
      expect.objectContaining({
        eventType: 'live_session_started',
        sessionId: 'live-session-1',
        chatId: 'chat-1',
      }),
      expect.objectContaining({
        eventType: 'live_session_connected',
        connectLatencyMs: 100,
      }),
      expect.objectContaining({
        eventType: 'live_session_error',
        errorMessage: 'socket closed',
      }),
      expect.objectContaining({
        eventType: 'live_session_ended',
        closeReason: 'socket closed',
      }),
    ]);
  });
});
