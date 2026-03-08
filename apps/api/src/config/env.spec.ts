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
    delete process.env['EPHEMERAL_TOKEN_TTL_SECONDS'];
    delete process.env['REDIS_URL'];

    const { env } = await import('./env');

    expect(env).toEqual({
      port: 3000,
      host: '127.0.0.1',
      geminiApiKey: '',
      ephemeralTokenTtlSeconds: 60,
      redisUrl: '',
    });
  });

  it('parses and exposes provided env vars', async () => {
    process.env['PORT'] = '4321';
    process.env['HOST'] = '0.0.0.0';
    process.env['GEMINI_API_KEY'] = 'key-123';
    process.env['EPHEMERAL_TOKEN_TTL_SECONDS'] = '120';
    process.env['REDIS_URL'] = 'redis://localhost:6379';

    const { env } = await import('./env');

    expect(env).toEqual({
      port: 4321,
      host: '0.0.0.0',
      geminiApiKey: 'key-123',
      ephemeralTokenTtlSeconds: 120,
      redisUrl: 'redis://localhost:6379',
    });
  });
});
