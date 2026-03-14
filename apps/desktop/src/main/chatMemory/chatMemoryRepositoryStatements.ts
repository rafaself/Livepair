import type { Database as SqliteDatabase } from 'better-sqlite3';

export function prepareChatMemoryRepositoryStatements(database: SqliteDatabase) {
  return {
    selectChatById: database.prepare(
      'SELECT id, title, created_at, updated_at, is_current FROM chats WHERE id = ?',
    ),
    selectCurrentChat: database.prepare(
      'SELECT id, title, created_at, updated_at, is_current FROM chats WHERE is_current = 1 LIMIT 1',
    ),
    listAllChats: database.prepare(
      'SELECT id, title, created_at, updated_at, is_current FROM chats ORDER BY updated_at DESC, id DESC',
    ),
    listMessagesByChatId: database.prepare(
      'SELECT id, chat_id, role, content_text, created_at, sequence FROM messages WHERE chat_id = ? ORDER BY sequence ASC, id ASC',
    ),
    demoteCurrentChats: database.prepare('UPDATE chats SET is_current = 0 WHERE is_current = 1'),
    insertChat: database.prepare(`
      INSERT INTO chats (id, created_at, updated_at, title, is_current)
      VALUES (@id, @createdAt, @updatedAt, @title, @isCurrent)
    `),
    updateChatTimestamp: database.prepare('UPDATE chats SET updated_at = ? WHERE id = ?'),
    nextMessageSequence: database.prepare(
      'SELECT COALESCE(MAX(sequence), 0) + 1 AS nextSequence FROM messages WHERE chat_id = ?',
    ),
    insertMessage: database.prepare(`
      INSERT INTO messages (id, chat_id, role, content_text, created_at, sequence)
      VALUES (@id, @chatId, @role, @contentText, @createdAt, @sequence)
    `),
    selectChatSummaryByChatId: database.prepare(
      `SELECT
         chat_id,
         schema_version,
         source,
         summary_text,
         covered_through_message_sequence,
         updated_at
       FROM chat_summaries
       WHERE chat_id = ?`,
    ),
    upsertChatSummary: database.prepare(`
      INSERT INTO chat_summaries (
        chat_id,
        schema_version,
        source,
        summary_text,
        covered_through_message_sequence,
        updated_at
      ) VALUES (
        @chatId,
        @schemaVersion,
        @source,
        @summaryText,
        @coveredThroughSequence,
        @updatedAt
      )
      ON CONFLICT(chat_id) DO UPDATE SET
        schema_version = excluded.schema_version,
        source = excluded.source,
        summary_text = excluded.summary_text,
        covered_through_message_sequence = excluded.covered_through_message_sequence,
        updated_at = excluded.updated_at
    `),
    listLiveSessionsByChatId: database.prepare(
      `SELECT
         id,
         chat_id,
         started_at,
         ended_at,
         status,
         ended_reason,
         resumption_handle,
         last_resumption_update_at,
         restorable,
         invalidated_at,
         invalidation_reason,
         summary_snapshot,
         context_state_snapshot
       FROM live_sessions
       WHERE chat_id = ?
       ORDER BY started_at DESC, id DESC`,
    ),
    insertLiveSession: database.prepare(`
      INSERT INTO live_sessions (
        id,
        chat_id,
        started_at,
        ended_at,
        status,
        ended_reason,
        resumption_handle,
        last_resumption_update_at,
        restorable,
        invalidated_at,
        invalidation_reason,
        summary_snapshot,
        context_state_snapshot
      ) VALUES (
        @id,
        @chatId,
        @startedAt,
        @endedAt,
        @status,
        @endedReason,
        @resumptionHandle,
        @lastResumptionUpdateAt,
        @restorable,
        @invalidatedAt,
        @invalidationReason,
        @summarySnapshot,
        @contextStateSnapshot
      )
    `),
    selectLiveSessionById: database.prepare(
      `SELECT
         id,
         chat_id,
         started_at,
         ended_at,
         status,
         ended_reason,
         resumption_handle,
         last_resumption_update_at,
         restorable,
         invalidated_at,
         invalidation_reason,
         summary_snapshot,
         context_state_snapshot
       FROM live_sessions
       WHERE id = ?`,
    ),
    updateLiveSessionRestoreMetadata: database.prepare(`
      UPDATE live_sessions
      SET resumption_handle = @resumptionHandle,
          last_resumption_update_at = @lastResumptionUpdateAt,
          restorable = @restorable,
          invalidated_at = @invalidatedAt,
          invalidation_reason = @invalidationReason,
          summary_snapshot = @summarySnapshot,
          context_state_snapshot = @contextStateSnapshot
      WHERE id = @id
    `),
    updateLiveSessionEndState: database.prepare(`
      UPDATE live_sessions
      SET ended_at = @endedAt,
          status = @status,
          ended_reason = @endedReason,
          resumption_handle = NULL,
          last_resumption_update_at = @lastResumptionUpdateAt,
          restorable = 0,
          invalidated_at = @invalidatedAt,
          invalidation_reason = @invalidationReason
      WHERE id = @id
    `),
  } as const;
}

export type ChatMemoryRepositoryStatements = ReturnType<
  typeof prepareChatMemoryRepositoryStatements
>;
