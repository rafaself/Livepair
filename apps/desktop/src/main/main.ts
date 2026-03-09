import { app, screen } from 'electron';
import { getDesktopSettingsService } from './settings/settingsService';
import { registerIpcHandlers } from './ipc/registerIpcHandlers';
import {
  createWindow,
  getMainWindow,
  handleAppActivate,
  handleWindowAllClosed,
  listAvailableDisplays,
  moveWindowToDisplay,
} from './window/overlayWindow';

const settingsService = getDesktopSettingsService();
registerIpcHandlers({
  getMainWindow,
  listDisplays: listAvailableDisplays,
  moveWindowToDisplay,
  settingsService,
});

app.whenReady().then(async () => {
  const settings = await settingsService.getSettings();
  createWindow(settings.selectedOverlayDisplayId);

  const handleDisplayTopologyChange = (): void => {
    void settingsService
      .getSettings()
      .then((currentSettings) => {
        moveWindowToDisplay(currentSettings.selectedOverlayDisplayId);
      });
  };

  screen.on('display-added', handleDisplayTopologyChange);
  screen.on('display-removed', handleDisplayTopologyChange);
  screen.on('display-metrics-changed', handleDisplayTopologyChange);

  app.on('activate', () => {
    void settingsService.getSettings().then((currentSettings) => {
      handleAppActivate(undefined, currentSettings.selectedOverlayDisplayId);
    });
  });
});

app.on('window-all-closed', () => {
  handleWindowAllClosed();
});

export { createWindow, handleAppActivate, handleWindowAllClosed };
