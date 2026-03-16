// @vitest-environment node
import { resolve } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const configMock = vi.fn();

vi.mock('dotenv', () => ({
  config: configMock,
}));

describe('loadRootEnv', () => {
  const originalDotenvConfigPath = process.env['DOTENV_CONFIG_PATH'];

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    configMock.mockReset();
    delete process.env['DOTENV_CONFIG_PATH'];
  });

  afterAll(() => {
    process.env['DOTENV_CONFIG_PATH'] = originalDotenvConfigPath;
  });

  it('loads the repository root .env by default', async () => {
    await import('./loadRootEnv');

    expect(configMock).toHaveBeenCalledWith({
      path: resolve(__dirname, '../../../../.env'),
      quiet: true,
    });
  });

  it('prefers DOTENV_CONFIG_PATH when one is provided', async () => {
    process.env['DOTENV_CONFIG_PATH'] = '/tmp/livepair-desktop.env';

    await import('./loadRootEnv');

    expect(configMock).toHaveBeenCalledWith({
      path: '/tmp/livepair-desktop.env',
      quiet: true,
    });
  });
});
