import { join } from 'path';
import { tmpdir } from 'os';

const connect = jest.fn();
const end = jest.fn();
const Pool = jest.fn().mockImplementation(() => ({
  connect,
  end,
}));

jest.mock('pg', () => ({
  Pool,
}));

describe('DatabaseService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env['DOTENV_CONFIG_PATH'] = join(tmpdir(), 'livepair-missing.env');
    process.env['DATABASE_URL'] = 'postgres://livepair:livepair@127.0.0.1:5432/livepair';
    connect.mockReset();
    end.mockReset();
    Pool.mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('creates and reuses a single pg pool', async () => {
    const { DatabaseService } = await import('./database.service');
    const service = new DatabaseService();

    const firstPool = service.getPool();
    const secondPool = service.getPool();

    expect(firstPool).toBe(secondPool);
    expect(Pool).toHaveBeenCalledTimes(1);
    expect(Pool).toHaveBeenCalledWith({
      connectionString: 'postgres://livepair:livepair@127.0.0.1:5432/livepair',
      application_name: 'livepair-api',
    });
  });

  it('runs a connection check and releases the client', async () => {
    const release = jest.fn();
    const query = jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] });
    connect.mockResolvedValue({
      query,
      release,
    });

    const { DatabaseService } = await import('./database.service');
    const service = new DatabaseService();

    await service.checkConnection();

    expect(query).toHaveBeenCalledWith('SELECT 1');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('uses the local default DATABASE_URL when a pool is requested without an override', async () => {
    delete process.env['DATABASE_URL'];

    const { DatabaseService } = await import('./database.service');
    const service = new DatabaseService();

    service.getPool();

    expect(Pool).toHaveBeenCalledWith({
      connectionString: 'postgres://livepair:livepair@127.0.0.1:5432/livepair',
      application_name: 'livepair-api',
    });
  });

  it('closes the pool on module destroy', async () => {
    end.mockResolvedValue(undefined);

    const { DatabaseService } = await import('./database.service');
    const service = new DatabaseService();

    service.getPool();
    await service.onModuleDestroy();

    expect(end).toHaveBeenCalledTimes(1);
  });
});
