export type LiveTelemetryEventType =
  | 'live_session_started'
  | 'live_session_connected'
  | 'live_session_resumed'
  | 'live_session_error'
  | 'live_usage_reported'
  | 'live_session_ended';

export interface LiveTelemetryBaseEvent {
  eventType: LiveTelemetryEventType;
  occurredAt: string;
  sessionId: string;
  chatId: string;
  environment: string;
  platform: string;
  appVersion: string;
  model: string;
}

export interface LiveTelemetrySessionStartedEvent extends LiveTelemetryBaseEvent {
  eventType: 'live_session_started';
}

export interface LiveTelemetrySessionConnectedEvent extends LiveTelemetryBaseEvent {
  eventType: 'live_session_connected';
  connectLatencyMs?: number;
}

export interface LiveTelemetrySessionResumedEvent extends LiveTelemetryBaseEvent {
  eventType: 'live_session_resumed';
  connectLatencyMs?: number;
  resumeCount?: number;
}

export interface LiveTelemetryUsageReportedEvent extends LiveTelemetryBaseEvent {
  eventType: 'live_usage_reported';
  usage: {
    totalTokenCount?: number;
    promptTokenCount?: number;
    responseTokenCount?: number;
    inputTokenCount?: number;
    outputTokenCount?: number;
    responseTokensDetails?: Array<{
      modality: string;
      tokenCount: number;
    }>;
  };
}

export interface LiveTelemetrySessionErrorEvent extends LiveTelemetryBaseEvent {
  eventType: 'live_session_error';
  errorCode?: string;
  errorMessage?: string;
}

export interface LiveTelemetrySessionEndedEvent extends LiveTelemetryBaseEvent {
  eventType: 'live_session_ended';
  firstResponseLatencyMs?: number;
  durationMs?: number;
  resumeCount?: number;
  interruptionCount?: number;
  closeReason?: string;
}

export type LiveTelemetryEvent =
  | LiveTelemetrySessionStartedEvent
  | LiveTelemetrySessionConnectedEvent
  | LiveTelemetrySessionResumedEvent
  | LiveTelemetryUsageReportedEvent
  | LiveTelemetrySessionErrorEvent
  | LiveTelemetrySessionEndedEvent;
