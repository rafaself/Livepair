import type {
  ChatMessageRecord,
  ChatRecord,
  DurableChatSummaryRecord,
  LiveSessionRecord,
  LiveSessionStatus,
  RehydrationPacketContextState,
} from '@livepair/shared-types';

// ---------------------------------------------------------------------------
// Row types — SQLite result shapes
// ---------------------------------------------------------------------------

export type ChatRow = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  is_current: number;
};

export type MessageRow = {
  id: string;
  chat_id: string;
  role: ChatMessageRecord['role'];
  content_text: string;
  created_at: string;
  sequence: number;
};

export type LiveSessionRow = {
  id: string;
  chat_id: string;
  started_at: string;
  ended_at: string | null;
  status: LiveSessionStatus;
  ended_reason: string | null;
  resumption_handle: string | null;
  last_resumption_update_at: string | null;
  restorable: number;
  invalidated_at: string | null;
  invalidation_reason: string | null;
  summary_snapshot: string | null;
  context_state_snapshot: string | null;
};

export type ChatSummaryRow = {
  chat_id: string;
  schema_version: number;
  source: string;
  summary_text: string;
  covered_through_message_sequence: number;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Row → record mappers
// ---------------------------------------------------------------------------

export function toChatRecord(row: ChatRow): ChatRecord {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isCurrent: row.is_current === 1,
  };
}

export function toChatMessageRecord(row: MessageRow): ChatMessageRecord {
  return {
    id: row.id,
    chatId: row.chat_id,
    role: row.role,
    contentText: row.content_text,
    createdAt: row.created_at,
    sequence: row.sequence,
  };
}

export function toDurableChatSummaryRecord(row: ChatSummaryRow): DurableChatSummaryRecord {
  return {
    chatId: row.chat_id,
    schemaVersion: row.schema_version,
    source: row.source,
    summaryText: row.summary_text,
    coveredThroughSequence: row.covered_through_message_sequence,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Context state snapshot parsing
// ---------------------------------------------------------------------------

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isStateEntry(
  value: unknown,
): value is RehydrationPacketContextState['task']['entries'][number] {
  return (
    isPlainRecord(value) &&
    typeof value['key'] === 'string' &&
    typeof value['value'] === 'string'
  );
}

function isStateSection(value: unknown): value is RehydrationPacketContextState['task'] {
  return (
    isPlainRecord(value) &&
    Array.isArray(value['entries']) &&
    value['entries'].every((entry) => isStateEntry(entry))
  );
}

function parseContextStateSnapshot(snapshot: string): RehydrationPacketContextState | null {
  try {
    const parsed: unknown = JSON.parse(snapshot);

    if (
      isPlainRecord(parsed) &&
      isStateSection(parsed['task']) &&
      isStateSection(parsed['context'])
    ) {
      return {
        task: {
          entries: parsed['task']['entries'],
        },
        context: {
          entries: parsed['context']['entries'],
        },
      };
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown parse error';
    console.warn(`[chat-memory] ignoring malformed persisted context state snapshot: ${detail}`);
    return null;
  }

  console.warn('[chat-memory] ignoring invalid persisted context state snapshot shape');
  return null;
}

export function toLiveSessionRecord(row: LiveSessionRow): LiveSessionRecord {
  const record: LiveSessionRecord = {
    id: row.id,
    chatId: row.chat_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    status: row.status,
    endedReason: row.ended_reason,
    resumptionHandle: row.resumption_handle,
    lastResumptionUpdateAt: row.last_resumption_update_at,
    restorable: row.restorable === 1,
    invalidatedAt: row.invalidated_at,
    invalidationReason: row.invalidation_reason,
  };

  if (row.summary_snapshot !== null) {
    record.summarySnapshot = row.summary_snapshot;
  }

  if (row.context_state_snapshot !== null) {
    const contextStateSnapshot = parseContextStateSnapshot(row.context_state_snapshot);

    if (contextStateSnapshot !== null) {
      record.contextStateSnapshot = contextStateSnapshot;
    }
  }

  return record;
}
