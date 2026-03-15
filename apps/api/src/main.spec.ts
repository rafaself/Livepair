import { tmpdir } from 'os';
import { join } from 'path';
import type { INestApplication } from '@nestjs/common';

const useGlobalPipes = jest.fn();
const listen = jest.fn();
const create = jest.fn(async (_module: unknown) => ({
  useGlobalPipes,
  listen,
})) as jest.MockedFunction<
  (_module: unknown) => Promise<Pick<INestApplication, 'useGlobalPipes' | 'listen'>>
>;

jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create,
  },
}));

describe('main bootstrap', () => {
  const originalPort = process.env['PORT'];
  const originalHost = process.env['HOST'];
  const originalDisableHttpListen = process.env['DISABLE_HTTP_LISTEN'];
  const originalNodeEnv = process.env['NODE_ENV'];
  const originalDotenvConfigPath = process.env['DOTENV_CONFIG_PATH'];
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {
    return undefined;
  });
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {
    return undefined;
  });

  beforeEach(() => {
    jest.resetModules();
    create.mockClear();
    useGlobalPipes.mockClear();
    listen.mockClear();
    logSpy.mockClear();
    warnSpy.mockClear();
    process.env['DOTENV_CONFIG_PATH'] = join(tmpdir(), 'livepair-missing.env');
    process.env['GEMINI_API_KEY'] = 'gemini-key';
  });

  afterAll(() => {
    process.env['PORT'] = originalPort;
    process.env['HOST'] = originalHost;
    process.env['DISABLE_HTTP_LISTEN'] = originalDisableHttpListen;
    process.env['NODE_ENV'] = originalNodeEnv;
    process.env['DOTENV_CONFIG_PATH'] = originalDotenvConfigPath;
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('bootstraps the app immediately on module load with default port', async () => {
    delete process.env['PORT'];
    delete process.env['HOST'];
    delete process.env['DISABLE_HTTP_LISTEN'];
    await import('./main');
    await new Promise((resolve) => setImmediate(resolve));

    expect(create).toHaveBeenCalledTimes(1);
    expect(useGlobalPipes).toHaveBeenCalledTimes(1);
    expect(listen).toHaveBeenCalledWith(3000, '127.0.0.1');
    expect(logSpy).toHaveBeenCalledWith('API listening on 127.0.0.1:3000');
  });

  it('uses explicit PORT and HOST values during bootstrap', async () => {
    process.env['PORT'] = '4050';
    process.env['HOST'] = '0.0.0.0';
    delete process.env['DISABLE_HTTP_LISTEN'];
    await import('./main');
    await new Promise((resolve) => setImmediate(resolve));

    expect(listen).toHaveBeenCalledWith(4050, '0.0.0.0');
    expect(logSpy).toHaveBeenCalledWith('API listening on 0.0.0.0:4050');
  });

  it('skips network bind when DISABLE_HTTP_LISTEN is true', async () => {
    process.env['DISABLE_HTTP_LISTEN'] = 'true';

    await import('./main');
    await new Promise((resolve) => setImmediate(resolve));

    expect(listen).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      'HTTP listen disabled (DISABLE_HTTP_LISTEN=true).',
    );
  });

  it('fails fast when GEMINI_API_KEY is missing', async () => {
    delete process.env['GEMINI_API_KEY'];
    delete process.env['DISABLE_HTTP_LISTEN'];

    await expect(import('./main')).rejects.toThrow(
      'GEMINI_API_KEY is required to start the API',
    );
    expect(create).not.toHaveBeenCalled();
    expect(listen).not.toHaveBeenCalled();
  });
});
