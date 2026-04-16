import {
  ASSISTANT_VOICES,
  type AppendChatMessageRequest,
  type AnswerMetadata,
  type ChatMemoryListOptions,
  type CreateChatRequest,
  type CreateLiveSessionRequest,
  type EndLiveSessionRequest,
  type RehydrationPacketContextState,
  type UpdateChatMessageRequest,
  type UpdateLiveSessionRequest,
  type UpdateLiveSessionResumptionRequest,
  type UpdateLiveSessionSnapshotRequest,
} from '@livepair/shared-types';
import {
  hasOnlyAllowedKeys,
  isNonEmptyString,
  isNullableString,
  isPlainRecord,
} from './shared';

function isAnswerProvenance(value: unknown): value is AnswerMetadata['provenance'] {
  return (
    value === 'project_grounded'
    || value === 'web_grounded'
    || value === 'tool_grounded'
    || value === 'unverified'
  );
}

function isAnswerConfidence(value: unknown): value is NonNullable<AnswerMetadata['confidence']> {
  return value === 'low' || value === 'medium' || value === 'high';
}

function isAnswerCitation(value: unknown): value is NonNullable<AnswerMetadata['citations']>[number] {
  return (
    isPlainRecord(value)
    && hasOnlyAllowedKeys(value, ['label', 'uri'])
    && isNonEmptyString(value['label'])
    && (typeof value['uri'] === 'undefined' || isNonEmptyString(value['uri']))
  );
}

function isAnswerMetadata(value: unknown): value is AnswerMetadata {
  if (!isPlainRecord(value) || !hasOnlyAllowedKeys(value, ['provenance', 'citations', 'confidence', 'reason', 'thinkingText'])) {
    return false;
  }

  return (
    isAnswerProvenance(value['provenance'])
    && (
      typeof value['citations'] === 'undefined'
      || (
        Array.isArray(value['citations'])
        && value['citations'].every((citation) => isAnswerCitation(citation))
      )
    )
    && (typeof value['confidence'] === 'undefined' || isAnswerConfidence(value['confidence']))
    && (typeof value['reason'] === 'undefined' || isNonEmptyString(value['reason']))
    && (typeof value['thinkingText'] === 'undefined' || isNonEmptyString(value['thinkingText']))
  );
}

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

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
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
  if (!isPlainRecord(value) || !hasOnlyAllowedKeys(value, ['chatId', 'role', 'contentText', 'answerMetadata'])) {
    return false;
  }

  return (
    isChatId(value['chatId'])
    && (value['role'] === 'user' || value['role'] === 'assistant')
    && isNonEmptyString(value['contentText'])
    && (typeof value['answerMetadata'] === 'undefined' || isAnswerMetadata(value['answerMetadata']))
  );
}

export function isUpdateChatMessageRequest(value: unknown): value is UpdateChatMessageRequest {
  if (!isPlainRecord(value) || !hasOnlyAllowedKeys(value, ['id', 'chatId', 'contentText'])) {
    return false;
  }

  return (
    isChatId(value['id'])
    && isChatId(value['chatId'])
    && isNonEmptyString(value['contentText'])
  );
}

export function isChatMemoryListOptions(value: unknown): value is ChatMemoryListOptions | undefined {
  if (typeof value === 'undefined') {
    return true;
  }

  if (!isPlainRecord(value) || !hasOnlyAllowedKeys(value, ['limit'])) {
    return false;
  }

  return typeof value['limit'] === 'undefined' || isPositiveInteger(value['limit']);
}

export function isCreateLiveSessionRequest(
  value: unknown,
): value is CreateLiveSessionRequest {
  if (!isPlainRecord(value) || !hasOnlyAllowedKeys(value, ['chatId', 'voice', 'startedAt'])) {
    return false;
  }

  return (
    isChatId(value['chatId'])
    && ASSISTANT_VOICES.some((voice) => voice === value['voice'])
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
