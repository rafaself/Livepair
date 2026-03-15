import type { SpeechSessionLifecycleEvent } from '../speech/speechSessionLifecycle';
import type {
  VoiceSessionLatencyMetric,
  VoiceSessionLatencyState,
} from '../voice/voice.types';

function getLastLatencyValue(metric: VoiceSessionLatencyMetric): number | null {
  return metric.valueMs ?? metric.lastValueMs;
}

function startPendingLatencyMetric(
  metric: VoiceSessionLatencyMetric,
  startedAtMs: number,
): VoiceSessionLatencyMetric {
  return {
    status: 'pending',
    valueMs: null,
    lastValueMs: getLastLatencyValue(metric),
    startedAtMs,
  };
}

function resolvePendingLatencyMetric(
  metric: VoiceSessionLatencyMetric,
  completedAtMs: number,
): VoiceSessionLatencyMetric {
  if (metric.status !== 'pending' || metric.startedAtMs === null) {
    return metric;
  }

  const valueMs = Math.max(0, completedAtMs - metric.startedAtMs);

  return {
    status: 'available',
    valueMs,
    lastValueMs: valueMs,
    startedAtMs: null,
  };
}

function markLatencyMetricUnavailable(metric: VoiceSessionLatencyMetric): VoiceSessionLatencyMetric {
  const nextLastValueMs = getLastLatencyValue(metric);

  if (
    metric.status === 'unavailable'
    && metric.valueMs === null
    && metric.startedAtMs === null
    && metric.lastValueMs === nextLastValueMs
  ) {
    return metric;
  }

  return {
    status: 'unavailable',
    valueMs: null,
    lastValueMs: nextLastValueMs,
    startedAtMs: null,
  };
}

function clearPendingLatencyMetric(metric: VoiceSessionLatencyMetric): VoiceSessionLatencyMetric {
  return metric.status === 'pending' ? markLatencyMetricUnavailable(metric) : metric;
}

export function invalidateVoiceSessionLatency(
  latency: VoiceSessionLatencyState,
): VoiceSessionLatencyState {
  return {
    connect: markLatencyMetricUnavailable(latency.connect),
    firstModelResponse: markLatencyMetricUnavailable(latency.firstModelResponse),
    speechToFirstModelResponse: markLatencyMetricUnavailable(
      latency.speechToFirstModelResponse,
    ),
  };
}

export function reduceVoiceSessionLatency(
  latency: VoiceSessionLatencyState,
  event: SpeechSessionLifecycleEvent,
  nowMs: number,
): VoiceSessionLatencyState {
  switch (event.type) {
    case 'session.start.requested':
      return {
        connect: startPendingLatencyMetric(latency.connect, nowMs),
        firstModelResponse: markLatencyMetricUnavailable(latency.firstModelResponse),
        speechToFirstModelResponse: markLatencyMetricUnavailable(latency.speechToFirstModelResponse),
      };
    case 'session.ready':
      return {
        connect: resolvePendingLatencyMetric(latency.connect, nowMs),
        firstModelResponse: startPendingLatencyMetric(latency.firstModelResponse, nowMs),
        speechToFirstModelResponse: markLatencyMetricUnavailable(latency.speechToFirstModelResponse),
      };
    case 'user.speech.detected':
      return {
        ...latency,
        speechToFirstModelResponse: startPendingLatencyMetric(
          latency.speechToFirstModelResponse,
          nowMs,
        ),
      };
    case 'assistant.output.started':
      return {
        ...latency,
        firstModelResponse: resolvePendingLatencyMetric(latency.firstModelResponse, nowMs),
        speechToFirstModelResponse: resolvePendingLatencyMetric(
          latency.speechToFirstModelResponse,
          nowMs,
        ),
      };
    case 'session.end.requested':
    case 'session.ended':
      return {
        connect: clearPendingLatencyMetric(latency.connect),
        firstModelResponse: clearPendingLatencyMetric(latency.firstModelResponse),
        speechToFirstModelResponse: clearPendingLatencyMetric(
          latency.speechToFirstModelResponse,
        ),
      };
    default:
      return latency;
  }
}
