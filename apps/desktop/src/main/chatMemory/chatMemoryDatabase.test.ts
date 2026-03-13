// @vitest-environment node
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { createChatMemoryDatabase } from './chatMemoryDatabase';

describe('createChatMemoryDatabase', () => {
  let databaseFilePath: string;
  const openDatabases: SqliteDatabase[] = [];

  const trackDatabase = (database: SqliteDatabase): SqliteDatabase => {
    openDatabases.push(database);
    return database;
  };

  beforeEach(async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'livepair-chat-memory-db-'));
    databaseFilePath = join(rootDir, 'chat-memory.sqlite');
  });

  afterEach(() => {
    while (openDatabases.length > 0) {
      openDatabases.pop()?.close();
    }
  });

  it('creates the database file, enables foreign keys, and bootstraps the current schema', () => {
    const database = trackDatabase(createChatMemoryDatabase(databaseFilePath));

    const tables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('schema_migrations', 'chats', 'messages', 'live_sessions', 'chat_summaries') ORDER BY name",
      )
      .all() as Array<{ name: string }>;

    expect(tables).toEqual([
      { name: 'chat_summaries' },
      { name: 'chats' },
      { name: 'live_sessions' },
      { name: 'messages' },
      { name: 'schema_migrations' },
    ]);
    expect(database.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(
      database.prepare('SELECT version FROM schema_migrations ORDER BY version').all(),
    ).toEqual([{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }, { version: 5 }]);
  });

  it('reuses the existing schema without duplicating migrations on reopen', () => {
    trackDatabase(createChatMemoryDatabase(databaseFilePath)).close();
    openDatabases.length = 0;

    const reopenedDatabase = trackDatabase(createChatMemoryDatabase(databaseFilePath));

    expect(
      reopenedDatabase.prepare('SELECT version FROM schema_migrations ORDER BY version').all(),
    ).toEqual([{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }, { version: 5 }]);
  });

  it('migrates an existing version 1 database to add live session persistence', () => {
    const legacyDatabase = trackDatabase(new BetterSqlite3(databaseFilePath));

    legacyDatabase.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY
      );
      INSERT INTO schema_migrations (version) VALUES (1);

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
    legacyDatabase.close();
    openDatabases.length = 0;

    const migratedDatabase = trackDatabase(createChatMemoryDatabase(databaseFilePath));

    expect(
      migratedDatabase
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'live_sessions'")
        .all(),
    ).toEqual([{ name: 'live_sessions' }]);
    expect(
      migratedDatabase.prepare('SELECT version FROM schema_migrations ORDER BY version').all(),
    ).toEqual([{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }, { version: 5 }]);
  });

  it('migrates a version 2 live_sessions table to normalized restore metadata columns', () => {
    const legacyDatabase = trackDatabase(new BetterSqlite3(databaseFilePath));

    legacyDatabase.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY
      );
      INSERT INTO schema_migrations (version) VALUES (1);
      INSERT INTO schema_migrations (version) VALUES (2);

      CREATE TABLE chats (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        title TEXT,
        is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1))
      );

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

      INSERT INTO chats (id, created_at, updated_at, title, is_current)
      VALUES ('chat-1', '2026-03-12T09:00:00.000Z', '2026-03-12T09:00:00.000Z', NULL, 1);

      INSERT INTO live_sessions (
        id,
        chat_id,
        started_at,
        ended_at,
        status,
        ended_reason,
        latest_resume_handle,
        resumable
      ) VALUES (
        'live-session-1',
        'chat-1',
        '2026-03-12T09:00:00.000Z',
        NULL,
        'active',
        NULL,
        'handles/live-session-1',
        1
      );
    `);
    legacyDatabase.close();
    openDatabases.length = 0;

    const migratedDatabase = trackDatabase(createChatMemoryDatabase(databaseFilePath));
    const columns = migratedDatabase
      .prepare("PRAGMA table_info('live_sessions')")
      .all() as Array<{ name: string }>;
    const liveSession = migratedDatabase
      .prepare('SELECT * FROM live_sessions WHERE id = ?')
      .get('live-session-1') as Record<string, unknown>;

    expect(columns.map((column) => column.name)).toEqual([
      'id',
      'chat_id',
      'started_at',
      'ended_at',
      'status',
      'ended_reason',
      'resumption_handle',
      'last_resumption_update_at',
      'restorable',
      'invalidated_at',
      'invalidation_reason',
      'summary_snapshot',
      'context_state_snapshot',
    ]);
    expect(liveSession).toEqual(
      expect.objectContaining({
        id: 'live-session-1',
        chat_id: 'chat-1',
        resumption_handle: 'handles/live-session-1',
        last_resumption_update_at: null,
        restorable: 1,
        invalidated_at: null,
        invalidation_reason: null,
        summary_snapshot: null,
        context_state_snapshot: null,
      }),
    );
  });

  it('migrates a version 3 live_sessions table to add snapshot columns', () => {
    const legacyDatabase = trackDatabase(new BetterSqlite3(databaseFilePath));

    legacyDatabase.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY
      );
      INSERT INTO schema_migrations (version) VALUES (1);
      INSERT INTO schema_migrations (version) VALUES (2);
      INSERT INTO schema_migrations (version) VALUES (3);

      CREATE TABLE chats (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        title TEXT,
        is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1))
      );

      CREATE TABLE live_sessions (
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
        invalidation_reason TEXT
      );

      INSERT INTO chats (id, created_at, updated_at, title, is_current)
      VALUES ('chat-1', '2026-03-12T09:00:00.000Z', '2026-03-12T09:00:00.000Z', NULL, 1);

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
      ) VALUES (
        'live-session-1',
        'chat-1',
        '2026-03-12T09:00:00.000Z',
        NULL,
        'active',
        NULL,
        NULL,
        NULL,
        0,
        NULL,
        NULL
      );
    `);
    legacyDatabase.close();
    openDatabases.length = 0;

    const migratedDatabase = trackDatabase(createChatMemoryDatabase(databaseFilePath));
    const columns = migratedDatabase
      .prepare("PRAGMA table_info('live_sessions')")
      .all() as Array<{ name: string }>;
    const liveSession = migratedDatabase
      .prepare('SELECT * FROM live_sessions WHERE id = ?')
      .get('live-session-1') as Record<string, unknown>;

    expect(columns.map((column) => column.name)).toEqual([
      'id',
      'chat_id',
      'started_at',
      'ended_at',
      'status',
      'ended_reason',
      'resumption_handle',
      'last_resumption_update_at',
      'restorable',
      'invalidated_at',
      'invalidation_reason',
      'summary_snapshot',
      'context_state_snapshot',
    ]);
    expect(liveSession).toEqual(
      expect.objectContaining({
        id: 'live-session-1',
        summary_snapshot: null,
        context_state_snapshot: null,
      }),
    );
  });

  it('migrates a version 4 database to add durable chat summary storage', () => {
    const legacyDatabase = trackDatabase(new BetterSqlite3(databaseFilePath));

    legacyDatabase.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY
      );
      INSERT INTO schema_migrations (version) VALUES (1);
      INSERT INTO schema_migrations (version) VALUES (2);
      INSERT INTO schema_migrations (version) VALUES (3);
      INSERT INTO schema_migrations (version) VALUES (4);

      CREATE TABLE chats (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        title TEXT,
        is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1))
      );

      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        content_text TEXT NOT NULL CHECK (length(content_text) > 0),
        created_at TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        UNIQUE(chat_id, sequence)
      );

      CREATE TABLE live_sessions (
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
    legacyDatabase.close();
    openDatabases.length = 0;

    const migratedDatabase = trackDatabase(createChatMemoryDatabase(databaseFilePath));
    const columns = migratedDatabase
      .prepare("PRAGMA table_info('chat_summaries')")
      .all() as Array<{ name: string }>;

    expect(columns.map((column) => column.name)).toEqual([
      'chat_id',
      'schema_version',
      'source',
      'summary_text',
      'covered_through_message_sequence',
      'updated_at',
    ]);
    expect(
      migratedDatabase.prepare('SELECT version FROM schema_migrations ORDER BY version').all(),
    ).toEqual([{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }, { version: 5 }]);
  });
});
