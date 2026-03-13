import BetterSqlite3, { type Database as SqliteDatabase } from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const INITIAL_SCHEMA_VERSION = 1;
const LIVE_SESSIONS_SCHEMA_VERSION = 2;
const LIVE_SESSION_RESTORE_METADATA_SCHEMA_VERSION = 3;
const LIVE_SESSION_REHYDRATION_SNAPSHOTS_SCHEMA_VERSION = 4;
const CHAT_SUMMARIES_SCHEMA_VERSION = 5;

function createLiveSessionsTable(database: SqliteDatabase, tableName = 'live_sessions'): void {
  database.exec(`
    CREATE TABLE ${tableName} (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      status TEXT NOT NULL CHECK (status IN ('active', 'ended', 'failed')),
      ended_reason TEXT,
      resumption_handle TEXT,
      last_resumption_update_at TEXT,
        restorable INTEGER NOT NULL DEFAULT 0 CHECK (restorable IN (0, 1)),
        invalidated_at TEXT,
        invalidation_reason TEXT,
        summary_snapshot TEXT,
        context_state_snapshot TEXT
    );
  `);
}

function createLiveSessionsIndexes(database: SqliteDatabase, tableName = 'live_sessions'): void {
  database.exec(`
    CREATE INDEX idx_${tableName}_chat_started_at
      ON ${tableName}(chat_id, started_at DESC, id DESC);
    CREATE INDEX idx_${tableName}_restore_started_at
      ON ${tableName}(status, restorable, started_at DESC, id DESC);
  `);
}

function applyInitialSchema(database: SqliteDatabase): void {
  database.exec(`
    CREATE TABLE chats (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      title TEXT,
      is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1))
    );

    CREATE UNIQUE INDEX idx_chats_current ON chats(is_current) WHERE is_current = 1;
    CREATE INDEX idx_chats_updated_at ON chats(updated_at DESC, created_at DESC);

    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content_text TEXT NOT NULL CHECK (length(content_text) > 0),
      created_at TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      UNIQUE(chat_id, sequence)
    );

    CREATE INDEX idx_messages_chat_sequence ON messages(chat_id, sequence);
  `);
}

function applyLiveSessionsSchema(database: SqliteDatabase): void {
  createLiveSessionsTable(database);
  createLiveSessionsIndexes(database);
}

function applyLiveSessionRestoreMetadataSchema(database: SqliteDatabase): void {
  const liveSessionColumns = new Set<string>(
    (
      database.prepare("PRAGMA table_info('live_sessions')").all() as Array<{ name: string }>
    ).map((row) => row.name),
  );

  if (liveSessionColumns.has('restorable')) {
    return;
  }

  database.exec(`
    ALTER TABLE live_sessions RENAME TO live_sessions_legacy;
  `);
  createLiveSessionsTable(database);
  database.exec(`
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
      invalidation_reason
    )
    SELECT
      id,
      chat_id,
      started_at,
      ended_at,
      status,
      ended_reason,
      latest_resume_handle,
      NULL,
      resumable,
      NULL,
      NULL
    FROM live_sessions_legacy;
    DROP TABLE live_sessions_legacy;
  `);
  createLiveSessionsIndexes(database);
}

function applyLiveSessionRehydrationSnapshotsSchema(database: SqliteDatabase): void {
  const liveSessionColumns = new Set<string>(
    (
      database.prepare("PRAGMA table_info('live_sessions')").all() as Array<{ name: string }>
    ).map((row) => row.name),
  );

  if (!liveSessionColumns.has('summary_snapshot')) {
    database.exec('ALTER TABLE live_sessions ADD COLUMN summary_snapshot TEXT;');
  }

  if (!liveSessionColumns.has('context_state_snapshot')) {
    database.exec('ALTER TABLE live_sessions ADD COLUMN context_state_snapshot TEXT;');
  }
}

function applyChatSummariesSchema(database: SqliteDatabase): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS chat_summaries (
      chat_id TEXT PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE,
      schema_version INTEGER NOT NULL,
      source TEXT NOT NULL,
      summary_text TEXT NOT NULL CHECK (length(summary_text) > 0),
      covered_through_message_sequence INTEGER NOT NULL
        CHECK (covered_through_message_sequence > 0),
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chat_summaries_updated_at
      ON chat_summaries(updated_at DESC, chat_id DESC);
  `);
}

function bootstrapChatMemoryDatabase(database: SqliteDatabase): void {
  const migrate = database.transaction(() => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY
      );
    `);

    const appliedVersions = new Set<number>(
      (
        database
          .prepare('SELECT version FROM schema_migrations ORDER BY version')
          .all() as Array<{ version: number }>
      ).map((row) => row.version),
    );

    if (!appliedVersions.has(INITIAL_SCHEMA_VERSION)) {
      applyInitialSchema(database);
      database
        .prepare('INSERT INTO schema_migrations (version) VALUES (?)')
        .run(INITIAL_SCHEMA_VERSION);
    }

    if (!appliedVersions.has(LIVE_SESSIONS_SCHEMA_VERSION)) {
      applyLiveSessionsSchema(database);
      database
        .prepare('INSERT INTO schema_migrations (version) VALUES (?)')
        .run(LIVE_SESSIONS_SCHEMA_VERSION);
    }

    if (!appliedVersions.has(LIVE_SESSION_RESTORE_METADATA_SCHEMA_VERSION)) {
      applyLiveSessionRestoreMetadataSchema(database);
      database
        .prepare('INSERT INTO schema_migrations (version) VALUES (?)')
        .run(LIVE_SESSION_RESTORE_METADATA_SCHEMA_VERSION);
    }

    if (!appliedVersions.has(LIVE_SESSION_REHYDRATION_SNAPSHOTS_SCHEMA_VERSION)) {
      applyLiveSessionRehydrationSnapshotsSchema(database);
      database
        .prepare('INSERT INTO schema_migrations (version) VALUES (?)')
        .run(LIVE_SESSION_REHYDRATION_SNAPSHOTS_SCHEMA_VERSION);
    }

    if (!appliedVersions.has(CHAT_SUMMARIES_SCHEMA_VERSION)) {
      applyChatSummariesSchema(database);
      database
        .prepare('INSERT INTO schema_migrations (version) VALUES (?)')
        .run(CHAT_SUMMARIES_SCHEMA_VERSION);
    }
  });

  migrate();
}

export function createChatMemoryDatabase(databaseFilePath: string): SqliteDatabase {
  mkdirSync(dirname(databaseFilePath), { recursive: true });

  const database = new BetterSqlite3(databaseFilePath);
  database.pragma('journal_mode = WAL');
  database.pragma('synchronous = NORMAL');
  database.pragma('foreign_keys = ON');

  bootstrapChatMemoryDatabase(database);

  return database;
}
