// @vitest-environment node
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

  it('creates the database file, enables foreign keys, and bootstraps the initial schema', () => {
    const database = trackDatabase(createChatMemoryDatabase(databaseFilePath));

    const tables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('schema_migrations', 'chats', 'messages') ORDER BY name",
      )
      .all() as Array<{ name: string }>;

    expect(tables).toEqual([
      { name: 'chats' },
      { name: 'messages' },
      { name: 'schema_migrations' },
    ]);
    expect(database.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(
      database.prepare('SELECT version FROM schema_migrations ORDER BY version').all(),
    ).toEqual([{ version: 1 }]);
  });

  it('reuses the existing schema without duplicating migrations on reopen', () => {
    trackDatabase(createChatMemoryDatabase(databaseFilePath)).close();
    openDatabases.length = 0;

    const reopenedDatabase = trackDatabase(createChatMemoryDatabase(databaseFilePath));

    expect(
      reopenedDatabase.prepare('SELECT version FROM schema_migrations ORDER BY version').all(),
    ).toEqual([{ version: 1 }]);
  });
});
