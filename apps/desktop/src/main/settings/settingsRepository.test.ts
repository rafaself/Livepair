// @vitest-environment node
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '../../shared/settings';
import { DesktopSettingsRepository } from './settingsRepository';

describe('DesktopSettingsRepository', () => {
  let settingsFilePath: string;

  beforeEach(async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'livepair-settings-'));
    settingsFilePath = join(rootDir, 'settings.json');
  });

  it('returns default settings when the settings file does not exist', async () => {
    const repository = new DesktopSettingsRepository(settingsFilePath);

    await expect(repository.getSettings()).resolves.toEqual(DEFAULT_DESKTOP_SETTINGS);
  });

  it('merges partial updates, normalizes values, and persists them to disk', async () => {
    const repository = new DesktopSettingsRepository(settingsFilePath);

    await expect(
      repository.updateSettings({
        backendUrl: ' https://api.livepair.dev/v1/ ',
        themePreference: 'dark',
      }),
    ).resolves.toEqual({
      ...DEFAULT_DESKTOP_SETTINGS,
      backendUrl: 'https://api.livepair.dev/v1',
      themePreference: 'dark',
    });

    const reloadedRepository = new DesktopSettingsRepository(settingsFilePath);
    await expect(reloadedRepository.getSettings()).resolves.toEqual({
      ...DEFAULT_DESKTOP_SETTINGS,
      backendUrl: 'https://api.livepair.dev/v1',
      themePreference: 'dark',
    });

    await expect(readFile(settingsFilePath, 'utf8')).resolves.toBe(
      JSON.stringify(
        {
          version: 1,
          settings: {
            ...DEFAULT_DESKTOP_SETTINGS,
            backendUrl: 'https://api.livepair.dev/v1',
            themePreference: 'dark',
          },
        },
        null,
        2,
      ),
    );
  });

  it('serializes overlapping updates so concurrent writes do not lose settings', async () => {
    vi.resetModules();

    let storedContents = JSON.stringify({
      version: 1,
      settings: DEFAULT_DESKTOP_SETTINGS,
    });
    let releaseReads = (): void => undefined;
    const readsReleased = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    let blockedReadCount = 0;

    vi.doMock('node:fs/promises', () => ({
      mkdir: vi.fn(async () => undefined),
      readFile: vi.fn(async () => {
        blockedReadCount += 1;

        if (blockedReadCount <= 2) {
          await readsReleased;
        }

        return storedContents;
      }),
      writeFile: vi.fn(async (_path: string, contents: string) => {
        storedContents = contents;
      }),
    }));

    try {
      const { DesktopSettingsRepository: ConcurrentRepository } = await import('./settingsRepository');
      const repository = new ConcurrentRepository('/tmp/livepair-settings-race.json');

      const themeUpdate = repository.updateSettings({ themePreference: 'dark' });
      const modeUpdate = repository.updateSettings({ preferredMode: 'thinking' });

      await Promise.resolve();
      await Promise.resolve();
      releaseReads();

      await Promise.all([themeUpdate, modeUpdate]);

      await expect(repository.getSettings()).resolves.toEqual({
        ...DEFAULT_DESKTOP_SETTINGS,
        themePreference: 'dark',
        preferredMode: 'thinking',
      });
    } finally {
      vi.doUnmock('node:fs/promises');
      vi.resetModules();
    }
  });
});
