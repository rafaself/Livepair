import type {
  LiveTelemetryBaseEvent,
  LiveTelemetryEvent,
  LiveTelemetrySessionEndedEvent,
  LiveTelemetryUsageReportedEvent,
} from '@livepair/shared-types';

type CollectorUsage = LiveTelemetryUsageReportedEvent['usage'];
type ResponseTokensDetail = NonNullable<CollectorUsage['responseTokensDetails']>[number];

export type LiveTelemetryCollectorContext = Pick<
  LiveTelemetryBaseEvent,
  'appVersion' | 'chatId' | 'environment' | 'model' | 'platform' | 'sessionId'
>;

type LiveTelemetryCollectorOptions = {
  emit: (events: LiveTelemetryEvent[]) => Promise<void>;
  now?: () => number;
};

type LiveTelemetryCollectorState = {
  context: LiveTelemetryCollectorContext;
  startedAtMs: number;
  firstResponseAtMs: number | null;
  interruptionCount: number;
  resumeCount: number;
  usage: CollectorUsage | null;
  hasEmittedError: boolean;
};

function buildOccurredAt(timestampMs: number): string {
  return new Date(timestampMs).toISOString();
}

function fireAndForget(
  emit: (events: LiveTelemetryEvent[]) => Promise<void>,
  events: LiveTelemetryEvent[],
): void {
  void emit(events).catch(() => undefined);
}

function sumOptionalNumbers(
  current: number | undefined,
  next: number | undefined,
): number | undefined {
  if (typeof next !== 'number' || !Number.isFinite(next)) {
    return current;
  }

  return (current ?? 0) + next;
}

function mergeResponseTokensDetails(
  current: CollectorUsage['responseTokensDetails'],
  next: CollectorUsage['responseTokensDetails'],
): CollectorUsage['responseTokensDetails'] | undefined {
  if ((!current || current.length === 0) && (!next || next.length === 0)) {
    return undefined;
  }

  const totals = new Map<string, number>();

  for (const detail of current ?? []) {
    totals.set(detail.modality, detail.tokenCount);
  }

  for (const detail of next ?? []) {
    totals.set(detail.modality, (totals.get(detail.modality) ?? 0) + detail.tokenCount);
  }

  const merged = Array.from(totals.entries()).map<ResponseTokensDetail>(([modality, tokenCount]) => ({
    modality,
    tokenCount,
  }));

  return merged.length > 0 ? merged : undefined;
}

function mergeUsage(
  current: CollectorUsage | null,
  next: CollectorUsage,
): CollectorUsage {
  const totalTokenCount = sumOptionalNumbers(current?.totalTokenCount, next.totalTokenCount);
  const promptTokenCount = sumOptionalNumbers(current?.promptTokenCount, next.promptTokenCount);
  const responseTokenCount = sumOptionalNumbers(current?.responseTokenCount, next.responseTokenCount);
  const inputTokenCount = sumOptionalNumbers(current?.inputTokenCount, next.inputTokenCount);
  const outputTokenCount = sumOptionalNumbers(current?.outputTokenCount, next.outputTokenCount);
  const responseTokensDetails = mergeResponseTokensDetails(
    current?.responseTokensDetails,
    next.responseTokensDetails,
  );

  return {
    ...(typeof totalTokenCount === 'number' ? { totalTokenCount } : {}),
    ...(typeof promptTokenCount === 'number' ? { promptTokenCount } : {}),
    ...(typeof responseTokenCount === 'number' ? { responseTokenCount } : {}),
    ...(typeof inputTokenCount === 'number' ? { inputTokenCount } : {}),
    ...(typeof outputTokenCount === 'number' ? { outputTokenCount } : {}),
    ...(responseTokensDetails ? { responseTokensDetails } : {}),
  };
}

export function createLiveTelemetryCollector({
  emit,
  now = () => Date.now(),
}: LiveTelemetryCollectorOptions) {
  let state: LiveTelemetryCollectorState | null = null;

  const buildBaseEvent = (
    timestampMs: number,
  ): Omit<LiveTelemetryBaseEvent, 'eventType'> | null => {
    if (!state) {
      return null;
    }

    return {
      occurredAt: buildOccurredAt(timestampMs),
      sessionId: state.context.sessionId,
      chatId: state.context.chatId,
      environment: state.context.environment,
      platform: state.context.platform,
      appVersion: state.context.appVersion,
      model: state.context.model,
    };
  };

  return {
    onSessionStarted(context: LiveTelemetryCollectorContext): void {
      const timestampMs = now();
      state = {
        context,
        startedAtMs: timestampMs,
        firstResponseAtMs: null,
        interruptionCount: 0,
        resumeCount: 0,
        usage: null,
        hasEmittedError: false,
      };

      const baseEvent = buildBaseEvent(timestampMs);

      if (!baseEvent) {
        return;
      }

      fireAndForget(emit, [{
        ...baseEvent,
        eventType: 'live_session_started',
      }]);
    },

    onSessionConnected(): void {
      if (!state) {
        return;
      }

      const timestampMs = now();
      const baseEvent = buildBaseEvent(timestampMs);

      if (!baseEvent) {
        return;
      }

      fireAndForget(emit, [{
        ...baseEvent,
        eventType: 'live_session_connected',
        connectLatencyMs: timestampMs - state.startedAtMs,
      }]);
    },

    onSessionResumed(): void {
      if (!state) {
        return;
      }

      state.resumeCount += 1;
      const timestampMs = now();
      const baseEvent = buildBaseEvent(timestampMs);

      if (!baseEvent) {
        return;
      }

      fireAndForget(emit, [{
        ...baseEvent,
        eventType: 'live_session_resumed',
        connectLatencyMs: timestampMs - state.startedAtMs,
        resumeCount: state.resumeCount,
      }]);
    },

    onUsageMetadata(usage: CollectorUsage): void {
      if (!state) {
        return;
      }

      state.usage = mergeUsage(state.usage, usage);
    },

    onInterruption(): void {
      if (!state) {
        return;
      }

      state.interruptionCount += 1;
    },

    onResponseStarted(): void {
      if (!state || state.firstResponseAtMs !== null) {
        return;
      }

      state.firstResponseAtMs = now();
    },

    onSessionError({
      errorCode,
      errorMessage,
    }: {
      errorCode?: string;
      errorMessage?: string;
    }): void {
      if (!state || state.hasEmittedError) {
        return;
      }

      state.hasEmittedError = true;
      const timestampMs = now();
      const baseEvent = buildBaseEvent(timestampMs);

      if (!baseEvent) {
        return;
      }

      fireAndForget(emit, [{
        ...baseEvent,
        eventType: 'live_session_error',
        ...(errorCode ? { errorCode } : {}),
        ...(errorMessage ? { errorMessage } : {}),
      }]);
    },

    onSessionEnded({
      closeReason,
    }: {
      closeReason?: string | null;
    } = {}): void {
      if (!state) {
        return;
      }

      const timestampMs = now();
      const baseEvent = buildBaseEvent(timestampMs);

      if (!baseEvent) {
        state = null;
        return;
      }

      const events: LiveTelemetryEvent[] = [];

      if (state.usage) {
        events.push({
          ...baseEvent,
          eventType: 'live_usage_reported',
          usage: state.usage,
        });
      }

      const endedEvent: LiveTelemetrySessionEndedEvent = {
        ...baseEvent,
        eventType: 'live_session_ended',
        durationMs: timestampMs - state.startedAtMs,
        ...(state.firstResponseAtMs !== null
          ? { firstResponseLatencyMs: state.firstResponseAtMs - state.startedAtMs }
          : {}),
        ...(state.resumeCount > 0 ? { resumeCount: state.resumeCount } : {}),
        ...(state.interruptionCount > 0 ? { interruptionCount: state.interruptionCount } : {}),
        ...(closeReason ? { closeReason } : {}),
      };
      events.push(endedEvent);
      state = null;
      fireAndForget(emit, events);
    },
  };
}
