import { tmpdir } from 'os';
import { join } from 'path';

const useGlobalPipes = jest.fn();
const set = jest.fn();
const enableCors = jest.fn();
const listen = jest.fn();
const create = jest.fn(async (_module: unknown) => ({
  useGlobalPipes,
  enableCors,
  listen,
  getHttpAdapter: () => ({
    getInstance: () => ({
      set,
    }),
  }),
}));

jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create,
  },
}));

describe('main bootstrap', () => {
  const originalPort = process.env['PORT'];
  const originalHost = process.env['HOST'];
  const originalDisableHttpListen = process.env['DISABLE_HTTP_LISTEN'];
  const originalCorsAllowedOrigins = process.env['CORS_ALLOWED_ORIGINS'];
  const originalGeminiApiKey = process.env['GEMINI_API_KEY'];
  const originalSessionTokenAuthSecret = process.env['SESSION_TOKEN_AUTH_SECRET'];
  const originalNodeEnv = process.env['NODE_ENV'];
  const originalDotenvConfigPath = process.env['DOTENV_CONFIG_PATH'];
  const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {
    return undefined;
  });
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {
    return undefined;
  });
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {
    return undefined;
  });

  beforeEach(() => {
    jest.resetModules();
    create.mockClear();
    useGlobalPipes.mockClear();
    set.mockClear();
    enableCors.mockClear();
    listen.mockClear();
    infoSpy.mockClear();
    warnSpy.mockClear();
    errorSpy.mockClear();
    delete process.env['PORT'];
    delete process.env['HOST'];
    delete process.env['DISABLE_HTTP_LISTEN'];
    process.env['DOTENV_CONFIG_PATH'] = join(tmpdir(), 'livepair-missing.env');
    process.env['GEMINI_API_KEY'] = 'gemini-key';
    process.env['SESSION_TOKEN_AUTH_SECRET'] = 'desktop-secret';
    process.env['CORS_ALLOWED_ORIGINS'] = 'https://allowed.livepair.dev,http://localhost:5173';
    process.env['NODE_ENV'] = 'test';
  });

  afterAll(() => {
    process.env['PORT'] = originalPort;
    process.env['HOST'] = originalHost;
    process.env['DISABLE_HTTP_LISTEN'] = originalDisableHttpListen;
    process.env['CORS_ALLOWED_ORIGINS'] = originalCorsAllowedOrigins;
    process.env['GEMINI_API_KEY'] = originalGeminiApiKey;
    process.env['SESSION_TOKEN_AUTH_SECRET'] = originalSessionTokenAuthSecret;
    process.env['NODE_ENV'] = originalNodeEnv;
    process.env['DOTENV_CONFIG_PATH'] = originalDotenvConfigPath;
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('bootstraps the app immediately on module load with default port', async () => {
    delete process.env['PORT'];
    delete process.env['HOST'];
    delete process.env['DISABLE_HTTP_LISTEN'];
    await import('./main');
    await new Promise((resolve) => setImmediate(resolve));

    expect(create).toHaveBeenCalledTimes(1);
    expect(useGlobalPipes).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith('trust proxy', 1);
    expect(enableCors).toHaveBeenCalledTimes(1);
    expect(listen).toHaveBeenCalledWith(3000, '0.0.0.0');
    expect(infoSpy).toHaveBeenCalledWith('[api:startup] listening', {
      corsAllowedOrigins: ['https://allowed.livepair.dev', 'http://localhost:5173'],
      host: '0.0.0.0',
      nodeEnv: 'test',
      port: 3000,
      trustProxy: 1,
    });
  });

  it('uses explicit PORT and HOST values during bootstrap', async () => {
    process.env['PORT'] = '4050';
    process.env['HOST'] = '0.0.0.0';
    delete process.env['DISABLE_HTTP_LISTEN'];
    await import('./main');
    await new Promise((resolve) => setImmediate(resolve));

    expect(listen).toHaveBeenCalledWith(4050, '0.0.0.0');
    expect(infoSpy).toHaveBeenCalledWith('[api:startup] listening', {
      corsAllowedOrigins: ['https://allowed.livepair.dev', 'http://localhost:5173'],
      host: '0.0.0.0',
      nodeEnv: 'test',
      port: 4050,
      trustProxy: 1,
    });
  });

  it('configures explicit CORS allowlists while still permitting non-browser requests', async () => {
    await import('./main');
    await new Promise((resolve) => setImmediate(resolve));

    expect(enableCors).toHaveBeenCalledTimes(1);
    const [corsOptions] = enableCors.mock.calls[0];
    const callback = jest.fn();

    corsOptions.origin(undefined, callback);
    expect(callback).toHaveBeenLastCalledWith(null, true);

    corsOptions.origin('https://allowed.livepair.dev', callback);
    expect(callback).toHaveBeenLastCalledWith(null, true);

    corsOptions.origin('https://blocked.livepair.dev', callback);
    expect(callback).toHaveBeenCalledWith(expect.any(Error));
  });

  it('skips network bind when DISABLE_HTTP_LISTEN is true', async () => {
    process.env['DISABLE_HTTP_LISTEN'] = 'true';

    await import('./main');
    await new Promise((resolve) => setImmediate(resolve));

    expect(listen).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('[api:startup] HTTP listen disabled', {
      disableHttpListen: true,
      host: '0.0.0.0',
      port: 3000,
    });
  });

  it('fails fast when required runtime config is missing', async () => {
    delete process.env['GEMINI_API_KEY'];
    await expect(import('./main')).rejects.toThrow(
      'Missing required environment variable GEMINI_API_KEY',
    );
    expect(errorSpy).toHaveBeenCalledWith('[api:startup] invalid configuration', {
      errorMessage: 'Missing required environment variable GEMINI_API_KEY',
      errorName: 'Error',
    });
    expect(create).not.toHaveBeenCalled();
    expect(listen).not.toHaveBeenCalled();
  });
});
