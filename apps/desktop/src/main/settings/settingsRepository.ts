import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  DEFAULT_DESKTOP_SETTINGS,
  normalizeDesktopSettings,
  normalizeDesktopSettingsPatch,
  type DesktopSettings,
  type DesktopSettingsPatch,
} from '../../shared/settings';

type StoredDesktopSettings = {
  version: number;
  settings: DesktopSettings;
};

const SETTINGS_SCHEMA_VERSION = 1;

function createDefaultStoredSettings(): StoredDesktopSettings {
  return {
    version: SETTINGS_SCHEMA_VERSION,
    settings: DEFAULT_DESKTOP_SETTINGS,
  };
}

export class DesktopSettingsRepository {
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly settingsFilePath: string) {}

  async getSettings(): Promise<DesktopSettings> {
    const storedSettings = await this.readStoredSettings();
    return storedSettings.settings;
  }

  async updateSettings(patch: DesktopSettingsPatch): Promise<DesktopSettings> {
    return this.runExclusive(async () => {
      const storedSettings = await this.readStoredSettings();
      const normalizedPatch = normalizeDesktopSettingsPatch(patch, storedSettings.settings);
      if (normalizedPatch === null) {
        throw new Error('Invalid desktop settings');
      }

      const nextSettings = normalizeDesktopSettings({
        ...storedSettings.settings,
        ...normalizedPatch,
      });

      if (nextSettings === null) {
        throw new Error('Invalid desktop settings');
      }

      await this.writeStoredSettings({
        version: SETTINGS_SCHEMA_VERSION,
        settings: nextSettings,
      });

      return nextSettings;
    });
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation, operation);
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async readStoredSettings(): Promise<StoredDesktopSettings> {
    try {
      const contents = await readFile(this.settingsFilePath, 'utf8');
      const parsed = JSON.parse(contents) as Partial<StoredDesktopSettings>;
      const normalizedSettings = normalizeDesktopSettings(parsed.settings ?? {});

      if (
        parsed.version !== SETTINGS_SCHEMA_VERSION ||
        normalizedSettings === null
      ) {
        return createDefaultStoredSettings();
      }

      return {
        version: SETTINGS_SCHEMA_VERSION,
        settings: normalizedSettings,
      };
    } catch {
      return createDefaultStoredSettings();
    }
  }

  private async writeStoredSettings(settings: StoredDesktopSettings): Promise<void> {
    await mkdir(dirname(this.settingsFilePath), { recursive: true });
    await writeFile(this.settingsFilePath, JSON.stringify(settings, null, 2), 'utf8');
  }
}
