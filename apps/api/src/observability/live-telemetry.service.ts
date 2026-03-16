import { Injectable } from '@nestjs/common';
import type { ReportLiveTelemetryDto } from './dto/report-live-telemetry.dto';

const LIVE_TELEMETRY_COMPONENT = 'live-telemetry';
const LIVE_TELEMETRY_MESSAGE = 'Accepted Gemini Live telemetry event';

type LiveTelemetrySeverity = 'INFO' | 'ERROR';

type AcceptedLiveTelemetryEvent = ReportLiveTelemetryDto['events'][number];

type LiveTelemetryUsage = NonNullable<AcceptedLiveTelemetryEvent['usage']>;

type LiveTelemetryLogEntry = {
  severity: LiveTelemetrySeverity;
  message: typeof LIVE_TELEMETRY_MESSAGE;
  component: typeof LIVE_TELEMETRY_COMPONENT;
  eventType: AcceptedLiveTelemetryEvent['eventType'];
  sessionId: string;
  chatId: string;
  environment: string;
  platform: string;
  appVersion: string;
  model: string;
  connectLatencyMs?: number;
  firstResponseLatencyMs?: number;
  durationMs?: number;
  resumeCount?: number;
  interruptionCount?: number;
  closeReason?: string;
  errorCode?: string;
  errorMessage?: string;
  usage?: Partial<LiveTelemetryUsage>;
};

@Injectable()
export class LiveTelemetryService {
  acceptBatch(events: ReportLiveTelemetryDto['events']): void {
    for (const event of events) {
      const entry = this.createLogEntry(event);
      const serializedEntry = JSON.stringify(entry);

      if (entry.severity === 'ERROR') {
        console.error(serializedEntry);
        continue;
      }

      console.info(serializedEntry);
    }
  }

  private createLogEntry(event: AcceptedLiveTelemetryEvent): LiveTelemetryLogEntry {
    const usage = event.usage ? this.compactUsage(event.usage) : undefined;

    return {
      severity: event.eventType === 'live_session_error' ? 'ERROR' : 'INFO',
      message: LIVE_TELEMETRY_MESSAGE,
      component: LIVE_TELEMETRY_COMPONENT,
      eventType: event.eventType,
      sessionId: event.sessionId,
      chatId: event.chatId,
      environment: event.environment,
      platform: event.platform,
      appVersion: event.appVersion,
      model: event.model,
      ...(event.connectLatencyMs !== undefined
        ? { connectLatencyMs: event.connectLatencyMs }
        : {}),
      ...(event.firstResponseLatencyMs !== undefined
        ? { firstResponseLatencyMs: event.firstResponseLatencyMs }
        : {}),
      ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
      ...(event.resumeCount !== undefined ? { resumeCount: event.resumeCount } : {}),
      ...(event.interruptionCount !== undefined
        ? { interruptionCount: event.interruptionCount }
        : {}),
      ...(event.closeReason !== undefined ? { closeReason: event.closeReason } : {}),
      ...(event.errorCode !== undefined ? { errorCode: event.errorCode } : {}),
      ...(event.errorMessage !== undefined ? { errorMessage: event.errorMessage } : {}),
      ...(usage !== undefined ? { usage } : {}),
    };
  }

  private compactUsage(usage: LiveTelemetryUsage): Partial<LiveTelemetryUsage> | undefined {
    const compactUsage: Partial<LiveTelemetryUsage> = {
      ...(usage.totalTokenCount !== undefined
        ? { totalTokenCount: usage.totalTokenCount }
        : {}),
      ...(usage.promptTokenCount !== undefined
        ? { promptTokenCount: usage.promptTokenCount }
        : {}),
      ...(usage.responseTokenCount !== undefined
        ? { responseTokenCount: usage.responseTokenCount }
        : {}),
      ...(usage.inputTokenCount !== undefined
        ? { inputTokenCount: usage.inputTokenCount }
        : {}),
      ...(usage.outputTokenCount !== undefined
        ? { outputTokenCount: usage.outputTokenCount }
        : {}),
      ...(usage.responseTokensDetails !== undefined
        ? {
            responseTokensDetails: usage.responseTokensDetails.map((detail) => ({
              modality: detail.modality,
              tokenCount: detail.tokenCount,
            })),
          }
        : {}),
    };

    return Object.keys(compactUsage).length > 0 ? compactUsage : undefined;
  }
}
