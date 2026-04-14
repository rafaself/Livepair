import { DatabaseService } from '../../database/database.service';

const hasDatabaseUrl = typeof process.env['DATABASE_URL'] === 'string'
  && process.env['DATABASE_URL'].trim().length > 0;
const isCi = typeof process.env['CI'] === 'string' && process.env['CI'].trim().length > 0;

if (isCi && !hasDatabaseUrl) {
  // Fail loudly rather than silently skip integration suites in CI, where a
  // missing DATABASE_URL is always a misconfiguration of the workflow.
  throw new Error(
    'DATABASE_URL must be set in CI; chat-memory integration suites cannot be silently skipped',
  );
}

export const describeWithDatabase = hasDatabaseUrl ? describe : describe.skip;

export async function truncateChatMemoryTables(databaseService: DatabaseService): Promise<void> {
  await databaseService.query(`
    TRUNCATE TABLE
      chat_summaries,
      live_sessions,
      messages,
      chats
    CASCADE
  `);
}
