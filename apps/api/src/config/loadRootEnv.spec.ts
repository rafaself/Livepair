import { resolve } from 'path';

const configMock = jest.fn();

jest.mock('dotenv', () => ({
  config: configMock,
}));

describe('loadRootEnv', () => {
  const originalDotenvConfigPath = process.env['DOTENV_CONFIG_PATH'];

  beforeEach(() => {
    jest.resetModules();
    configMock.mockReset();
    delete process.env['DOTENV_CONFIG_PATH'];
  });

  afterAll(() => {
    process.env['DOTENV_CONFIG_PATH'] = originalDotenvConfigPath;
  });

  it('loads the API app-local .env by default', async () => {
    await import('./loadRootEnv');

    expect(configMock).toHaveBeenCalledWith({
      path: resolve(__dirname, '../../.env'),
      quiet: true,
    });
  });

  it('prefers DOTENV_CONFIG_PATH when one is provided', async () => {
    process.env['DOTENV_CONFIG_PATH'] = '/tmp/livepair-custom.env';

    await import('./loadRootEnv');

    expect(configMock).toHaveBeenCalledWith({
      path: '/tmp/livepair-custom.env',
      quiet: true,
    });
  });
});
