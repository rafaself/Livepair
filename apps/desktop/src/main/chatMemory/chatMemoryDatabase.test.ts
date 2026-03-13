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
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('schema_migrations', 'chats', 'messages', 'live_sessions') ORDER BY name",
      )
      .all() as Array<{ name: string }>;

    expect(tables).toEqual([
      { name: 'chats' },
      { name: 'live_sessions' },
      { name: 'messages' },
      { name: 'schema_migrations' },
    ]);
    expect(database.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(
      database.prepare('SELECT version FROM schema_migrations ORDER BY version').all(),
    ).toEqual([{ version: 1 }, { version: 2 }]);
  });

  it('reuses the existing schema without duplicating migrations on reopen', () => {
    trackDatabase(createChatMemoryDatabase(databaseFilePath)).close();
    openDatabases.length = 0;

    const reopenedDatabase = trackDatabase(createChatMemoryDatabase(databaseFilePath));

    expect(
      reopenedDatabase.prepare('SELECT version FROM schema_migrations ORDER BY version').all(),
    ).toEqual([{ version: 1 }, { version: 2 }]);
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
    ).toEqual([{ version: 1 }, { version: 2 }]);
  });
});
