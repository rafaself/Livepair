// @vitest-environment node
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DESKTOP_SETTINGS,
  DEFAULT_SYSTEM_INSTRUCTION,
  getMaxUserSystemInstructionLength,
  MAX_SYSTEM_INSTRUCTION_LENGTH,
} from '../../shared/settings';
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

  it('falls back to defaults when the stored file has an unsupported version or invalid settings', async () => {
    const versionMismatchPath = join(tmpdir(), `livepair-settings-version-${Date.now()}.json`);
    const invalidSettingsPath = join(tmpdir(), `livepair-settings-invalid-${Date.now()}.json`);
    const { writeFile } = await import('node:fs/promises');

    await writeFile(
      versionMismatchPath,
      JSON.stringify({
        version: 99,
        settings: DEFAULT_DESKTOP_SETTINGS,
      }),
    );
    await writeFile(
      invalidSettingsPath,
      JSON.stringify({
        version: 1,
        settings: {
          ...DEFAULT_DESKTOP_SETTINGS,
          selectedInputDeviceId: '',
        },
      }),
    );

    await expect(new DesktopSettingsRepository(versionMismatchPath).getSettings()).resolves.toEqual(
      DEFAULT_DESKTOP_SETTINGS,
    );
    await expect(new DesktopSettingsRepository(invalidSettingsPath).getSettings()).resolves.toEqual(
      DEFAULT_DESKTOP_SETTINGS,
    );
  });

  it('merges partial updates, normalizes values, and persists them to disk', async () => {
    const repository = new DesktopSettingsRepository(settingsFilePath);
    const ungroundedBudget = getMaxUserSystemInstructionLength({
      groundingEnabled: false,
    });
    const overlongInstruction = `  ${'x'.repeat(MAX_SYSTEM_INSTRUCTION_LENGTH + 15)}  `;

    await expect(
      repository.updateSettings({
        themePreference: 'dark',
        groundingEnabled: false,
        voice: 'Kore',
        systemInstruction: overlongInstruction,
      }),
    ).resolves.toEqual({
      ...DEFAULT_DESKTOP_SETTINGS,
      themePreference: 'dark',
      groundingEnabled: false,
      voice: 'Kore',
      systemInstruction: 'x'.repeat(ungroundedBudget),
    });

    const reloadedRepository = new DesktopSettingsRepository(settingsFilePath);
    await expect(reloadedRepository.getSettings()).resolves.toEqual({
      ...DEFAULT_DESKTOP_SETTINGS,
      themePreference: 'dark',
      groundingEnabled: false,
      voice: 'Kore',
      systemInstruction: 'x'.repeat(ungroundedBudget),
    });

    await expect(readFile(settingsFilePath, 'utf8')).resolves.toBe(
      JSON.stringify(
        {
          version: 1,
            settings: {
              ...DEFAULT_DESKTOP_SETTINGS,
              themePreference: 'dark',
              groundingEnabled: false,
              voice: 'Kore',
              systemInstruction: 'x'.repeat(ungroundedBudget),
            },
        },
        null,
        2,
      ),
    );
  });

  it('re-normalizes instructions when grounding shrinks the available budget', async () => {
    const repository = new DesktopSettingsRepository(settingsFilePath);
    const ungroundedBudget = getMaxUserSystemInstructionLength({
      groundingEnabled: false,
    });
    const groundedBudget = getMaxUserSystemInstructionLength({
      groundingEnabled: true,
    });

    await repository.updateSettings({
      groundingEnabled: false,
      systemInstruction: 'z'.repeat(ungroundedBudget),
    });

    await expect(
      repository.updateSettings({
        groundingEnabled: true,
      }),
    ).resolves.toEqual({
      ...DEFAULT_DESKTOP_SETTINGS,
      groundingEnabled: true,
      systemInstruction: 'z'.repeat(groundedBudget),
    });
  });

  it('fills missing new preferences and falls back invalid persisted preference values', async () => {
    const legacySettingsPath = join(tmpdir(), `livepair-settings-legacy-${Date.now()}.json`);
    const { writeFile } = await import('node:fs/promises');

    await writeFile(
      legacySettingsPath,
      JSON.stringify({
        version: 1,
        settings: {
          ...DEFAULT_DESKTOP_SETTINGS,
          backendUrl: 'https://legacy.livepair.dev',
          voice: 'BadVoice',
          groundingEnabled: 'sometimes',
          systemInstruction: '   ',
        },
      }),
    );

    await expect(new DesktopSettingsRepository(legacySettingsPath).getSettings()).resolves.toEqual({
      ...DEFAULT_DESKTOP_SETTINGS,
      groundingEnabled: false,
      voice: 'Puck',
      systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
    });
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
      const pinUpdate = repository.updateSettings({ isPanelPinned: true });

      await Promise.resolve();
      await Promise.resolve();
      releaseReads();

      await Promise.all([themeUpdate, pinUpdate]);

      await expect(repository.getSettings()).resolves.toEqual({
        ...DEFAULT_DESKTOP_SETTINGS,
        themePreference: 'dark',
        isPanelPinned: true,
      });
    } finally {
      vi.doUnmock('node:fs/promises');
      vi.resetModules();
    }
  });

  it('rejects invalid update patches before writing to disk', async () => {
    const repository = new DesktopSettingsRepository(settingsFilePath);

    await expect(
      repository.updateSettings({ selectedOutputDeviceId: '' }),
    ).rejects.toThrow('Invalid desktop settings');
  });
});
