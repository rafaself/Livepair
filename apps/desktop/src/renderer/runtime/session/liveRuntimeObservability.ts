import type { LiveTelemetryUsageReportedEvent } from '@livepair/shared-types';
import {
  createLiveTelemetryCollector,
  type LiveTelemetryCollectorContext,
} from './liveTelemetryCollector';

export type LiveRuntimeDiagnosticScope =
  | 'session'
  | 'voice-session'
  | 'voice-playback'
  | 'voice-capture'
  | 'screen-capture';

export type LiveRuntimeDiagnosticEvent = {
  scope: LiveRuntimeDiagnosticScope;
  name: string;
  level?: 'info' | 'error';
  detail?: string | null;
  data?: Record<string, unknown>;
};

type LiveRuntimeObservabilityOptions = {
  emitTelemetry: Parameters<typeof createLiveTelemetryCollector>[0]['emit'];
  logDiagnostic: (
    scope: string,
    message: string,
    payload?: Record<string, unknown>,
  ) => void;
  logError: (
    scope: string,
    message: string,
    payload?: Record<string, unknown>,
  ) => void;
  getTurnId?: () => string | null;
  now?: () => number;
};

function compactPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const entries = Object.entries(payload).filter(([, value]) => value !== undefined);

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

export function createLiveRuntimeObservability({
  emitTelemetry,
  logDiagnostic,
  logError,
  getTurnId,
  now,
}: LiveRuntimeObservabilityOptions) {
  const telemetry = createLiveTelemetryCollector({
    emit: emitTelemetry,
    ...(now ? { now } : {}),
  });
  let sessionContext: LiveTelemetryCollectorContext | null = null;

  const buildCorrelationPayload = (): Record<string, unknown> => {
    if (!sessionContext) {
      return {};
    }

    return {
      sessionId: sessionContext.sessionId,
      chatId: sessionContext.chatId,
      ...(getTurnId?.() ? { turnId: getTurnId() } : {}),
    };
  };

  return {
    onSessionStarted(context: LiveTelemetryCollectorContext): void {
      sessionContext = context;
      telemetry.onSessionStarted(context);
    },

    onSessionConnected(): void {
      telemetry.onSessionConnected();
    },

    onSessionResumed(): void {
      telemetry.onSessionResumed();
    },

    onUsageMetadata(usage: LiveTelemetryUsageReportedEvent['usage']): void {
      telemetry.onUsageMetadata(usage);
    },

    onInterruption(): void {
      telemetry.onInterruption();
    },

    onResponseStarted(): void {
      telemetry.onResponseStarted();
    },

    onSessionError({
      scope = 'voice-session',
      name = 'session-error',
      detail,
      errorCode,
      errorMessage,
      data,
    }: {
      scope?: LiveRuntimeDiagnosticScope;
      name?: string;
      detail?: string | null;
      errorCode?: string;
      errorMessage?: string;
      data?: Record<string, unknown>;
    }): void {
      const telemetryError = errorMessage ?? detail;
      const telemetryPayload: {
        errorCode?: string;
        errorMessage?: string;
      } = {};

      if (errorCode) {
        telemetryPayload.errorCode = errorCode;
      }

      if (telemetryError) {
        telemetryPayload.errorMessage = telemetryError;
      }

      telemetry.onSessionError(telemetryPayload);
      this.emitDiagnostic({
        scope,
        name,
        level: 'error',
        detail: detail ?? errorMessage ?? null,
        data: {
          ...(errorCode ? { errorCode } : {}),
          ...data,
        },
      });
    },

    onSessionEnded({
      closeReason,
    }: {
      closeReason?: string | null;
    } = {}): void {
      if (typeof closeReason === 'undefined') {
        telemetry.onSessionEnded();
      } else {
        telemetry.onSessionEnded({ closeReason });
      }
      sessionContext = null;
    },

    emitDiagnostic(event: LiveRuntimeDiagnosticEvent): void {
      const payload = compactPayload({
        ...buildCorrelationPayload(),
        ...(event.detail ? { detail: event.detail } : {}),
        ...event.data,
      });

      if (event.level === 'error') {
        logError(event.scope, event.name, payload);
        return;
      }

      logDiagnostic(event.scope, event.name, payload);
    },
  };
}
