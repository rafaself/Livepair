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
  const originalNodeEnv = process.env['NODE_ENV'];
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {
    return undefined;
  });

  beforeEach(() => {
    jest.resetModules();
    create.mockClear();
    useGlobalPipes.mockClear();
    listen.mockClear();
    logSpy.mockClear();
  });

  afterAll(() => {
    process.env['PORT'] = originalPort;
    process.env['NODE_ENV'] = originalNodeEnv;
    logSpy.mockRestore();
  });

  it('bootstraps the app immediately on module load with default port', async () => {
    delete process.env['PORT'];
    await import('./main');
    await new Promise((resolve) => setImmediate(resolve));

    expect(create).toHaveBeenCalledTimes(1);
    expect(useGlobalPipes).toHaveBeenCalledTimes(1);
    expect(listen).toHaveBeenCalledWith(3000);
    expect(logSpy).toHaveBeenCalledWith('API listening on port 3000');
  });

  it('uses explicit PORT value during bootstrap as a parsed number', async () => {
    process.env['PORT'] = '4050';
    await import('./main');
    await new Promise((resolve) => setImmediate(resolve));

    expect(listen).toHaveBeenCalledWith(4050);
    expect(logSpy).toHaveBeenCalledWith('API listening on port 4050');
  });
});
