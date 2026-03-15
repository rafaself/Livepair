import type { PoolConfig } from 'pg';
import { env } from '../config/env';

export const DATABASE_APPLICATION_NAME = 'livepair-api' as const;

export function getRequiredDatabaseUrl(): string {
  if (!env.databaseUrl) {
    throw new Error('DATABASE_URL is not configured');
  }

  return env.databaseUrl;
}

export function buildDatabasePoolConfig(): PoolConfig {
  return {
    connectionString: getRequiredDatabaseUrl(),
    application_name: DATABASE_APPLICATION_NAME,
  };
}
