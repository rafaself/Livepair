import type {
  AppendChatMessageRequest,
  CreateChatRequest,
  CreateLiveSessionRequest,
  EndLiveSessionRequest,
  RehydrationPacketContextState,
  UpdateLiveSessionRequest,
  UpdateLiveSessionResumptionRequest,
  UpdateLiveSessionSnapshotRequest,
} from '@livepair/shared-types';
import {
  hasOnlyAllowedKeys,
  isNonEmptyString,
  isNullableString,
  isPlainRecord,
} from './shared';

function isStateEntry(
  value: unknown,
): value is RehydrationPacketContextState['task']['entries'][number] {
  return (
    isPlainRecord(value)
    && hasOnlyAllowedKeys(value, ['key', 'value'])
    && typeof value['key'] === 'string'
    && typeof value['value'] === 'string'
  );
}

function isStateSection(value: unknown): value is RehydrationPacketContextState['task'] {
  return (
    isPlainRecord(value)
    && hasOnlyAllowedKeys(value, ['entries'])
    && Array.isArray(value['entries'])
    && value['entries'].every((entry) => isStateEntry(entry))
  );
}

function isContextStateSnapshot(value: unknown): value is RehydrationPacketContextState {
  return (
    isPlainRecord(value)
    && hasOnlyAllowedKeys(value, ['task', 'context'])
    && isStateSection(value['task'])
    && isStateSection(value['context'])
  );
}

function isUpdateLiveSessionResumptionRequest(
  value: unknown,
): value is UpdateLiveSessionResumptionRequest {
  if (
    !isPlainRecord(value)
    || !hasOnlyAllowedKeys(value, [
      'kind',
      'id',
      'resumptionHandle',
      'lastResumptionUpdateAt',
      'restorable',
      'invalidatedAt',
      'invalidationReason',
    ])
  ) {
    return false;
  }

  return (
    value['kind'] === 'resumption'
    && isChatId(value['id'])
    && (
      'resumptionHandle' in value
      || 'lastResumptionUpdateAt' in value
      || 'restorable' in value
      || 'invalidatedAt' in value
      || 'invalidationReason' in value
    )
    && isNullableString(value['resumptionHandle'])
    && isNullableString(value['lastResumptionUpdateAt'])
    && (
      typeof value['restorable'] === 'undefined'
      || typeof value['restorable'] === 'boolean'
    )
    && isNullableString(value['invalidatedAt'])
    && isNullableString(value['invalidationReason'])
  );
}

function isUpdateLiveSessionSnapshotRequest(
  value: unknown,
): value is UpdateLiveSessionSnapshotRequest {
  if (
    !isPlainRecord(value)
    || !hasOnlyAllowedKeys(value, [
      'kind',
      'id',
      'summarySnapshot',
      'contextStateSnapshot',
    ])
  ) {
    return false;
  }

  return (
    value['kind'] === 'snapshot'
    && isChatId(value['id'])
    && ('summarySnapshot' in value || 'contextStateSnapshot' in value)
    && isNullableString(value['summarySnapshot'])
    && (
      typeof value['contextStateSnapshot'] === 'undefined'
      || value['contextStateSnapshot'] === null
      || isContextStateSnapshot(value['contextStateSnapshot'])
    )
  );
}

export function isChatId(value: unknown): value is string {
  return isNonEmptyString(value);
}

export function isCreateChatRequest(value: unknown): value is CreateChatRequest | undefined {
  if (typeof value === 'undefined') {
    return true;
  }

  if (!isPlainRecord(value)) {
    return false;
  }

  if (!hasOnlyAllowedKeys(value, ['title'])) {
    return false;
  }

  return (
    typeof value['title'] === 'undefined'
    || value['title'] === null
    || typeof value['title'] === 'string'
  );
}

export function isAppendChatMessageRequest(value: unknown): value is AppendChatMessageRequest {
  if (!isPlainRecord(value) || !hasOnlyAllowedKeys(value, ['chatId', 'role', 'contentText'])) {
    return false;
  }

  return (
    isChatId(value['chatId'])
    && (value['role'] === 'user' || value['role'] === 'assistant')
    && isNonEmptyString(value['contentText'])
  );
}

export function isCreateLiveSessionRequest(
  value: unknown,
): value is CreateLiveSessionRequest {
  if (!isPlainRecord(value) || !hasOnlyAllowedKeys(value, ['chatId', 'startedAt'])) {
    return false;
  }

  return (
    isChatId(value['chatId'])
    && (typeof value['startedAt'] === 'undefined' || typeof value['startedAt'] === 'string')
  );
}

export function isEndLiveSessionRequest(value: unknown): value is EndLiveSessionRequest {
  if (!isPlainRecord(value) || !hasOnlyAllowedKeys(value, ['id', 'endedAt', 'status', 'endedReason'])) {
    return false;
  }

  return (
    isChatId(value['id'])
    && (value['status'] === 'ended' || value['status'] === 'failed')
    && (typeof value['endedAt'] === 'undefined' || typeof value['endedAt'] === 'string')
    && (
      typeof value['endedReason'] === 'undefined'
      || value['endedReason'] === null
      || typeof value['endedReason'] === 'string'
    )
  );
}

export function isUpdateLiveSessionRequest(
  value: unknown,
): value is UpdateLiveSessionRequest {
  return (
    isUpdateLiveSessionResumptionRequest(value)
    || isUpdateLiveSessionSnapshotRequest(value)
  );
}
