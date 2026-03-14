import type { EndLiveSessionRequest, UpdateLiveSessionRequest } from '@livepair/shared-types';
import type { LiveSessionRow } from './rowMappers';

export function buildUpdatedLiveSessionRow(
  existingRow: LiveSessionRow,
  input: UpdateLiveSessionRequest,
): LiveSessionRow {
  const didReceiveResumptionMetadata =
    input.kind === 'resumption'
    && (
      typeof input.resumptionHandle !== 'undefined'
      || typeof input.restorable !== 'undefined'
      || typeof input.invalidatedAt !== 'undefined'
      || typeof input.invalidationReason !== 'undefined'
    );
  const requestedRestorable =
    input.kind === 'resumption'
      ? (
        typeof input.restorable === 'undefined'
          ? existingRow.restorable === 1
          : input.restorable
      )
      : existingRow.restorable === 1;
  const resumptionHandle =
    input.kind === 'resumption'
      ? (
        requestedRestorable
          ? (
            typeof input.resumptionHandle === 'undefined'
              ? existingRow.resumption_handle
              : input.resumptionHandle
          )
          : null
      )
      : existingRow.resumption_handle;
  const lastResumptionUpdateAt =
    input.kind === 'resumption'
      ? (
        typeof input.lastResumptionUpdateAt === 'undefined'
          ? didReceiveResumptionMetadata
            ? new Date().toISOString()
            : existingRow.last_resumption_update_at
          : input.lastResumptionUpdateAt
      )
      : existingRow.last_resumption_update_at;
  const invalidatedAt =
    input.kind === 'resumption'
      ? (
        requestedRestorable
          ? null
          : typeof input.invalidatedAt === 'undefined'
            ? existingRow.invalidated_at ?? (didReceiveResumptionMetadata ? lastResumptionUpdateAt : null)
            : input.invalidatedAt
      )
      : existingRow.invalidated_at;
  const invalidationReason =
    input.kind === 'resumption'
      ? (
        requestedRestorable
          ? null
          : typeof input.invalidationReason === 'undefined'
            ? existingRow.invalidation_reason
            : input.invalidationReason
      )
      : existingRow.invalidation_reason;
  const summarySnapshot =
    input.kind === 'snapshot'
      ? (
        typeof input.summarySnapshot === 'undefined'
          ? existingRow.summary_snapshot
          : input.summarySnapshot
      )
      : existingRow.summary_snapshot;
  const contextStateSnapshot =
    input.kind === 'snapshot'
      ? (
        typeof input.contextStateSnapshot === 'undefined'
          ? existingRow.context_state_snapshot
          : input.contextStateSnapshot === null
            ? null
            : JSON.stringify(input.contextStateSnapshot)
      )
      : existingRow.context_state_snapshot;

  return {
    ...existingRow,
    resumption_handle: resumptionHandle,
    last_resumption_update_at: lastResumptionUpdateAt,
    restorable: requestedRestorable ? 1 : 0,
    invalidated_at: invalidatedAt,
    invalidation_reason: invalidationReason,
    summary_snapshot: summarySnapshot,
    context_state_snapshot: contextStateSnapshot,
  };
}

export function buildEndedLiveSessionRow(
  existingRow: LiveSessionRow,
  input: EndLiveSessionRequest,
): LiveSessionRow {
  const endedAt = input.endedAt ?? new Date().toISOString();
  const endedReason = input.endedReason ?? null;
  const invalidationReason = endedReason ?? existingRow.invalidation_reason;

  return {
    ...existingRow,
    ended_at: endedAt,
    status: input.status,
    ended_reason: endedReason,
    resumption_handle: null,
    last_resumption_update_at: endedAt,
    restorable: 0,
    invalidated_at: endedAt,
    invalidation_reason: invalidationReason,
  };
}
