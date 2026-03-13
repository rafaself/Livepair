import BetterSqlite3, { type Database as SqliteDatabase } from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const INITIAL_SCHEMA_VERSION = 1;
const LIVE_SESSIONS_SCHEMA_VERSION = 2;

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
  database.exec(`
    CREATE TABLE live_sessions (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      status TEXT NOT NULL CHECK (status IN ('active', 'ended', 'failed')),
      ended_reason TEXT,
      latest_resume_handle TEXT,
      resumable INTEGER NOT NULL DEFAULT 0 CHECK (resumable IN (0, 1))
    );

    CREATE INDEX idx_live_sessions_chat_started_at
      ON live_sessions(chat_id, started_at DESC, id DESC);
    CREATE INDEX idx_live_sessions_status_started_at
      ON live_sessions(status, started_at DESC, id DESC);
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
