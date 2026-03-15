import '../../config/loadRootEnv';
import { Pool } from 'pg';
import { buildDatabasePoolConfig } from '../database.config';

async function main(): Promise<void> {
  const pool = new Pool(buildDatabasePoolConfig());

  try {
    await pool.query('SELECT 1');
    console.log('PostgreSQL connection OK.');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`PostgreSQL connection failed: ${detail}`);
  process.exitCode = 1;
});
