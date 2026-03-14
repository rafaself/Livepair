import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared';
import type { DesktopSettingsService } from '../../settings/settingsService';
import { isDesktopSettingsPatch } from '../validators/settingsValidators';

export function registerSettingsIpcHandlers({
  settingsService,
}: {
  settingsService: DesktopSettingsService;
}): void {
  ipcMain.handle(IPC_CHANNELS.getSettings, async () => {
    return settingsService.getSettings();
  });

  ipcMain.handle(IPC_CHANNELS.updateSettings, async (_event, patch: unknown) => {
    if (!isDesktopSettingsPatch(patch)) {
      throw new Error('Invalid settings update');
    }

    return settingsService.updateSettings(patch);
  });
}
