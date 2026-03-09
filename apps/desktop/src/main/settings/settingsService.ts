import { app } from 'electron';
import { join } from 'node:path';
import type {
  DesktopSettings,
  DesktopSettingsPatch,
  LegacySettingsSnapshot,
} from '../../shared/settings';
import { DesktopSettingsRepository } from './settingsRepository';

export class DesktopSettingsService {
  private cachedSettings: DesktopSettings | null = null;

  constructor(private readonly repository: DesktopSettingsRepository) {}

  async getSettings(): Promise<DesktopSettings> {
    if (this.cachedSettings !== null) {
      return this.cachedSettings;
    }

    this.cachedSettings = await this.repository.getSettings();
    return this.cachedSettings;
  }

  async updateSettings(patch: DesktopSettingsPatch): Promise<DesktopSettings> {
    this.cachedSettings = await this.repository.updateSettings(patch);
    return this.cachedSettings;
  }

  async migrateLegacySettings(snapshot: LegacySettingsSnapshot): Promise<DesktopSettings> {
    this.cachedSettings = await this.repository.migrateLegacySettings(snapshot);
    return this.cachedSettings;
  }
}

let settingsService: DesktopSettingsService | null = null;

export function getDesktopSettingsService(): DesktopSettingsService {
  if (settingsService === null) {
    settingsService = new DesktopSettingsService(
      new DesktopSettingsRepository(join(app.getPath('userData'), 'desktop-settings.json')),
    );
  }

  return settingsService;
}
