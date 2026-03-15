import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { env } from '../config/env';
import { buildDatabasePoolConfig } from './database.config';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private pool: Pool | null = null;

  get isConfigured(): boolean {
    return env.databaseUrl.length > 0;
  }

  getPool(): Pool {
    if (this.pool !== null) {
      return this.pool;
    }

    this.pool = new Pool(buildDatabasePoolConfig());
    return this.pool;
  }

  async connect(): Promise<PoolClient> {
    return this.getPool().connect();
  }

  async query<TResult extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<TResult>> {
    return this.getPool().query<TResult>(text, values ? [...values] : undefined);
  }

  async checkConnection(): Promise<void> {
    const client = await this.connect();

    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool === null) {
      return;
    }

    const pool = this.pool;
    this.pool = null;
    await pool.end();
  }
}
