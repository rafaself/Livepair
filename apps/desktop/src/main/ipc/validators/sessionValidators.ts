import type {
  CreateEphemeralTokenRequest,
  LiveTelemetryEvent,
  ProjectKnowledgeSearchRequest,
} from '@livepair/shared-types';
import {
  hasOnlyAllowedKeys,
  isNullableString,
  isNonEmptyString,
  isPlainRecord,
} from './shared';

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

function isTelemetryBaseEvent(value: unknown): value is LiveTelemetryEvent {
  return (
    isPlainRecord(value)
    && isValidTimestamp(value['occurredAt'])
    && isNonEmptyString(value['sessionId'])
    && isNonEmptyString(value['chatId'])
    && isNonEmptyString(value['environment'])
    && isNonEmptyString(value['platform'])
    && isNonEmptyString(value['appVersion'])
    && isNonEmptyString(value['model'])
  );
}

function isResponseTokensDetails(
  value: unknown,
): value is NonNullable<Extract<LiveTelemetryEvent, { eventType: 'live_usage_reported' }>['usage']['responseTokensDetails']> {
  return (
    Array.isArray(value)
    && value.every((detail) =>
      isPlainRecord(detail)
      && isNonEmptyString(detail['modality'])
      && isFiniteNonNegativeNumber(detail['tokenCount'])
    )
  );
}

function isUsagePayload(
  value: unknown,
): value is Extract<LiveTelemetryEvent, { eventType: 'live_usage_reported' }>['usage'] {
  if (!isPlainRecord(value)) {
    return false;
  }

  const allowedKeys = [
    'totalTokenCount',
    'promptTokenCount',
    'responseTokenCount',
    'inputTokenCount',
    'outputTokenCount',
    'responseTokensDetails',
  ] as const;

  if (!hasOnlyAllowedKeys(value, allowedKeys)) {
    return false;
  }

  return (
    (!('totalTokenCount' in value) || isFiniteNonNegativeNumber(value['totalTokenCount']))
    && (!('promptTokenCount' in value) || isFiniteNonNegativeNumber(value['promptTokenCount']))
    && (!('responseTokenCount' in value) || isFiniteNonNegativeNumber(value['responseTokenCount']))
    && (!('inputTokenCount' in value) || isFiniteNonNegativeNumber(value['inputTokenCount']))
    && (!('outputTokenCount' in value) || isFiniteNonNegativeNumber(value['outputTokenCount']))
    && (!('responseTokensDetails' in value) || isResponseTokensDetails(value['responseTokensDetails']))
  );
}

export function isCreateEphemeralTokenRequest(
  req: unknown,
): req is CreateEphemeralTokenRequest {
  if (!isPlainRecord(req) || !hasOnlyAllowedKeys(req, ['sessionId'])) {
    return false;
  }

  if (!('sessionId' in req)) {
    return true;
  }

  const sessionId = req['sessionId'];
  return typeof sessionId === 'string' || typeof sessionId === 'undefined';
}

export function isProjectKnowledgeSearchRequest(
  req: unknown,
): req is ProjectKnowledgeSearchRequest {
  return (
    isPlainRecord(req)
    && hasOnlyAllowedKeys(req, ['query'])
    && isNonEmptyString(req['query'])
  );
}

export function isLiveTelemetryBatchRequest(
  req: unknown,
): req is LiveTelemetryEvent[] {
  if (!Array.isArray(req)) {
    return false;
  }

  return req.every((event) => {
    if (!isTelemetryBaseEvent(event) || typeof event['eventType'] !== 'string') {
      return false;
    }

    const eventRecord = event as unknown as Record<string, unknown>;

    switch (event['eventType']) {
      case 'live_session_started':
        return hasOnlyAllowedKeys(eventRecord, [
          'eventType',
          'occurredAt',
          'sessionId',
          'chatId',
          'environment',
          'platform',
          'appVersion',
          'model',
        ]);
      case 'live_session_connected':
        return (
          hasOnlyAllowedKeys(eventRecord, [
            'eventType',
            'occurredAt',
            'sessionId',
            'chatId',
            'environment',
            'platform',
            'appVersion',
            'model',
            'connectLatencyMs',
          ])
          && (!('connectLatencyMs' in event) || isFiniteNonNegativeNumber(event['connectLatencyMs']))
        );
      case 'live_session_resumed':
        return (
          hasOnlyAllowedKeys(eventRecord, [
            'eventType',
            'occurredAt',
            'sessionId',
            'chatId',
            'environment',
            'platform',
            'appVersion',
            'model',
            'connectLatencyMs',
            'resumeCount',
          ])
          && (!('connectLatencyMs' in event) || isFiniteNonNegativeNumber(event['connectLatencyMs']))
          && (!('resumeCount' in event) || isFiniteNonNegativeNumber(event['resumeCount']))
        );
      case 'live_session_error':
        return (
          hasOnlyAllowedKeys(eventRecord, [
            'eventType',
            'occurredAt',
            'sessionId',
            'chatId',
            'environment',
            'platform',
            'appVersion',
            'model',
            'errorCode',
            'errorMessage',
          ])
          && isNullableString(event['errorCode'])
          && isNullableString(event['errorMessage'])
        );
      case 'live_usage_reported':
        return (
          hasOnlyAllowedKeys(eventRecord, [
            'eventType',
            'occurredAt',
            'sessionId',
            'chatId',
            'environment',
            'platform',
            'appVersion',
            'model',
            'usage',
          ])
          && isUsagePayload(event['usage'])
        );
      case 'live_session_ended':
        return (
          hasOnlyAllowedKeys(eventRecord, [
            'eventType',
            'occurredAt',
            'sessionId',
            'chatId',
            'environment',
            'platform',
            'appVersion',
            'model',
            'firstResponseLatencyMs',
            'durationMs',
            'resumeCount',
            'interruptionCount',
            'closeReason',
          ])
          && (!('firstResponseLatencyMs' in event) || isFiniteNonNegativeNumber(event['firstResponseLatencyMs']))
          && (!('durationMs' in event) || isFiniteNonNegativeNumber(event['durationMs']))
          && (!('resumeCount' in event) || isFiniteNonNegativeNumber(event['resumeCount']))
          && (!('interruptionCount' in event) || isFiniteNonNegativeNumber(event['interruptionCount']))
          && isNullableString(event['closeReason'])
        );
      default:
        return false;
    }
  });
}
