import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('env config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

    it('uses default values when env vars are not set', async () => {
      delete process.env['PORT'];
      delete process.env['HOST'];
      delete process.env['GEMINI_API_KEY'];
      delete process.env['SESSION_TOKEN_AUTH_SECRET'];
      delete process.env['DATABASE_URL'];
      delete process.env['EPHEMERAL_TOKEN_TTL_SECONDS'];
      delete process.env['REDIS_URL'];
    process.env['DOTENV_CONFIG_PATH'] = join(tmpdir(), 'livepair-missing.env');

    try {
      const { env } = await import('./env');

        expect(env).toEqual({
          port: 3000,
          host: '127.0.0.1',
          geminiApiKey: '',
          sessionTokenAuthSecret: '',
          databaseUrl: '',
          ephemeralTokenTtlSeconds: 60,
          redisUrl: '',
      });
    } finally {
      delete process.env['DOTENV_CONFIG_PATH'];
    }
  });

  it('parses and exposes provided env vars', async () => {
      process.env['PORT'] = '4321';
      process.env['HOST'] = '0.0.0.0';
      process.env['GEMINI_API_KEY'] = 'key-123';
      process.env['SESSION_TOKEN_AUTH_SECRET'] = 'desktop-secret';
      process.env['DATABASE_URL'] = 'postgres://livepair:livepair@127.0.0.1:5432/livepair';
      process.env['EPHEMERAL_TOKEN_TTL_SECONDS'] = '120';
      process.env['REDIS_URL'] = 'redis://localhost:6379';
    process.env['DOTENV_CONFIG_PATH'] = join(tmpdir(), 'livepair-missing.env');

    try {
      const { env } = await import('./env');

        expect(env).toEqual({
          port: 4321,
          host: '0.0.0.0',
          geminiApiKey: 'key-123',
          sessionTokenAuthSecret: 'desktop-secret',
          databaseUrl: 'postgres://livepair:livepair@127.0.0.1:5432/livepair',
          ephemeralTokenTtlSeconds: 120,
          redisUrl: 'redis://localhost:6379',
      });
    } finally {
      delete process.env['DOTENV_CONFIG_PATH'];
    }
  });

  it('loads values from a dotenv file before Nest config bootstraps', async () => {
      delete process.env['PORT'];
      delete process.env['HOST'];
      delete process.env['GEMINI_API_KEY'];
      delete process.env['SESSION_TOKEN_AUTH_SECRET'];
      delete process.env['DATABASE_URL'];
      delete process.env['EPHEMERAL_TOKEN_TTL_SECONDS'];
      delete process.env['REDIS_URL'];

    const tempDir = mkdtempSync(join(tmpdir(), 'livepair-api-env-'));
    const envFile = join(tempDir, '.env');
    writeFileSync(
      envFile,
        [
          'PORT=4010',
          'HOST=0.0.0.0',
          'GEMINI_API_KEY=dotenv-key',
          'SESSION_TOKEN_AUTH_SECRET=dotenv-secret',
          'DATABASE_URL=postgres://dotenv:dotenv@127.0.0.1:5432/dotenv',
          'EPHEMERAL_TOKEN_TTL_SECONDS=75',
          'REDIS_URL=redis://dotenv',
      ].join('\n'),
    );

    process.env['DOTENV_CONFIG_PATH'] = envFile;

    try {
      const { env } = await import('./env');

        expect(env).toEqual({
          port: 4010,
          host: '0.0.0.0',
          geminiApiKey: 'dotenv-key',
          sessionTokenAuthSecret: 'dotenv-secret',
          databaseUrl: 'postgres://dotenv:dotenv@127.0.0.1:5432/dotenv',
          ephemeralTokenTtlSeconds: 75,
          redisUrl: 'redis://dotenv',
      });
    } finally {
      delete process.env['DOTENV_CONFIG_PATH'];
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

});
