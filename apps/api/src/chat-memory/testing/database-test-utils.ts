import { DatabaseService } from '../../database/database.service';

export const describeWithDatabase = process.env['DATABASE_URL'] ? describe : describe.skip;

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
