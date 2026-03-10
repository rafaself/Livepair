import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  DEFAULT_DESKTOP_SETTINGS,
  PRIMARY_DISPLAY_ID,
  normalizeDesktopSettings,
  normalizeDesktopSettingsPatch,
  type DesktopSettings,
  type DesktopSettingsPatch,
} from '../../shared/settings';

type StoredDesktopSettings = {
  version: number;
  settings: DesktopSettings;
};

const SETTINGS_SCHEMA_VERSION = 2;

function createDefaultStoredSettings(): StoredDesktopSettings {
  return {
    version: SETTINGS_SCHEMA_VERSION,
    settings: DEFAULT_DESKTOP_SETTINGS,
  };
}

function migrateStoredSettings(
  version: number,
  settings: DesktopSettings,
): StoredDesktopSettings {
  if (version < SETTINGS_SCHEMA_VERSION) {
    return {
      version: SETTINGS_SCHEMA_VERSION,
      settings: DEFAULT_DESKTOP_SETTINGS,
    };
  }

  return {
    version: SETTINGS_SCHEMA_VERSION,
    settings,
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
      const normalizedPatch = normalizeDesktopSettingsPatch(patch);
      if (normalizedPatch === null) {
        throw new Error('Invalid desktop settings');
      }

      const storedSettings = await this.readStoredSettings();
      const mergedSettings = {
        ...storedSettings.settings,
        ...normalizedPatch,
      };

      if (
        normalizedPatch.selectedCaptureDisplayId === PRIMARY_DISPLAY_ID &&
        !('selectedCaptureDisplayLabel' in normalizedPatch)
      ) {
        delete mergedSettings.selectedCaptureDisplayLabel;
      }

      if (
        normalizedPatch.selectedOverlayDisplayId === PRIMARY_DISPLAY_ID &&
        !('selectedOverlayDisplayLabel' in normalizedPatch)
      ) {
        delete mergedSettings.selectedOverlayDisplayLabel;
      }

      const nextSettings = normalizeDesktopSettings({
        ...mergedSettings,
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

      if (normalizedSettings === null || typeof parsed.version !== 'number') {
        return createDefaultStoredSettings();
      }

      const migratedSettings = migrateStoredSettings(parsed.version, normalizedSettings);

      if (migratedSettings.version !== parsed.version) {
        await this.writeStoredSettings(migratedSettings);
      }

      return migratedSettings;
    } catch {
      return createDefaultStoredSettings();
    }
  }

  private async writeStoredSettings(settings: StoredDesktopSettings): Promise<void> {
    await mkdir(dirname(this.settingsFilePath), { recursive: true });
    await writeFile(this.settingsFilePath, JSON.stringify(settings, null, 2), 'utf8');
  }
}
