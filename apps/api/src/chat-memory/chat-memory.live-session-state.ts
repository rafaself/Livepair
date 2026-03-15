import type {
  EndLiveSessionRequest,
  LiveSessionRecord,
  UpdateLiveSessionRequest,
} from '@livepair/shared-types';

export function buildUpdatedLiveSessionRecord(
  existingRecord: LiveSessionRecord,
  input: UpdateLiveSessionRequest,
): LiveSessionRecord {
  const didReceiveResumptionMetadata =
    input.kind === 'resumption' &&
    (
      typeof input.resumptionHandle !== 'undefined' ||
      typeof input.restorable !== 'undefined' ||
      typeof input.invalidatedAt !== 'undefined' ||
      typeof input.invalidationReason !== 'undefined'
    );
  const requestedRestorable =
    input.kind === 'resumption'
      ? (
        typeof input.restorable === 'undefined'
          ? existingRecord.restorable
          : input.restorable
      )
      : existingRecord.restorable;
  const resumptionHandle =
    input.kind === 'resumption'
      ? (
        requestedRestorable
          ? (
            typeof input.resumptionHandle === 'undefined'
              ? existingRecord.resumptionHandle
              : input.resumptionHandle
          )
          : null
      )
      : existingRecord.resumptionHandle;
  const lastResumptionUpdateAt =
    input.kind === 'resumption'
      ? (
        typeof input.lastResumptionUpdateAt === 'undefined'
          ? didReceiveResumptionMetadata
            ? new Date().toISOString()
            : existingRecord.lastResumptionUpdateAt
          : input.lastResumptionUpdateAt
      )
      : existingRecord.lastResumptionUpdateAt;
  const invalidatedAt =
    input.kind === 'resumption'
      ? (
        requestedRestorable
          ? null
          : typeof input.invalidatedAt === 'undefined'
            ? existingRecord.invalidatedAt ?? (didReceiveResumptionMetadata ? lastResumptionUpdateAt : null)
            : input.invalidatedAt
      )
      : existingRecord.invalidatedAt;
  const invalidationReason =
    input.kind === 'resumption'
      ? (
        requestedRestorable
          ? null
          : typeof input.invalidationReason === 'undefined'
            ? existingRecord.invalidationReason
            : input.invalidationReason
      )
      : existingRecord.invalidationReason;
  const summarySnapshot =
    input.kind === 'snapshot'
      ? (
        typeof input.summarySnapshot === 'undefined'
          ? existingRecord.summarySnapshot ?? null
          : input.summarySnapshot
      )
      : existingRecord.summarySnapshot ?? null;
  const contextStateSnapshot =
    input.kind === 'snapshot'
      ? (
        typeof input.contextStateSnapshot === 'undefined'
          ? existingRecord.contextStateSnapshot ?? null
          : input.contextStateSnapshot
      )
      : existingRecord.contextStateSnapshot ?? null;

  return {
    ...existingRecord,
    resumptionHandle,
    lastResumptionUpdateAt,
    restorable: requestedRestorable,
    invalidatedAt,
    invalidationReason,
    summarySnapshot,
    contextStateSnapshot,
  };
}

export function buildEndedLiveSessionRecord(
  existingRecord: LiveSessionRecord,
  input: EndLiveSessionRequest,
): LiveSessionRecord {
  const endedAt = input.endedAt ?? new Date().toISOString();
  const endedReason = input.endedReason ?? null;
  const invalidationReason = endedReason ?? existingRecord.invalidationReason;

  return {
    ...existingRecord,
    endedAt,
    status: input.status,
    endedReason,
    resumptionHandle: null,
    lastResumptionUpdateAt: endedAt,
    restorable: false,
    invalidatedAt: endedAt,
    invalidationReason,
  };
}
