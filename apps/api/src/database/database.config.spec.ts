import { join } from 'path';
import { tmpdir } from 'os';

describe('database config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env['DOTENV_CONFIG_PATH'] = join(tmpdir(), 'livepair-missing.env');
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('builds a pool config from DATABASE_URL', async () => {
    process.env['DATABASE_URL'] = 'postgres://livepair:livepair@127.0.0.1:5432/livepair';

    const { buildDatabasePoolConfig, DATABASE_APPLICATION_NAME } = await import('./database.config');

    expect(buildDatabasePoolConfig()).toEqual({
      connectionString: 'postgres://livepair:livepair@127.0.0.1:5432/livepair',
      application_name: DATABASE_APPLICATION_NAME,
    });
  });

  it('throws when DATABASE_URL is missing', async () => {
    delete process.env['DATABASE_URL'];

    const { buildDatabasePoolConfig } = await import('./database.config');

    expect(() => buildDatabasePoolConfig()).toThrow('DATABASE_URL is not configured');
  });
});
