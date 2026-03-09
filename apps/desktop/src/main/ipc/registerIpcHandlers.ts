import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/desktopBridge';
import type { DesktopSettingsService } from '../settings/settingsService';
import { createBackendClient } from '../backend/backendClient';
import {
  isCreateEphemeralTokenRequest,
  isDesktopSettingsPatch,
  toOverlayRectangles,
} from './validators';

type RegisterIpcHandlersOptions = {
  fetchImpl?: typeof fetch;
  getMainWindow: () => BrowserWindow | null;
  platform?: NodeJS.Platform;
  settingsService: DesktopSettingsService;
};

export function registerIpcHandlers({
  fetchImpl = fetch,
  getMainWindow,
  platform = process.platform,
  settingsService,
}: RegisterIpcHandlersOptions): void {
  const backendClient = createBackendClient({
    fetchImpl,
    getBackendUrl: async () => (await settingsService.getSettings()).backendUrl,
  });

  ipcMain.handle(IPC_CHANNELS.checkHealth, async () => {
    return backendClient.checkHealth();
  });

  ipcMain.handle(
    IPC_CHANNELS.requestSessionToken,
    async (_event, req: unknown) => {
      if (!isCreateEphemeralTokenRequest(req)) {
        throw new Error('Invalid token request payload');
      }

      return backendClient.requestSessionToken(req);
    },
  );

  ipcMain.handle(IPC_CHANNELS.getSettings, async () => {
    return settingsService.getSettings();
  });

  ipcMain.handle(
    IPC_CHANNELS.updateSettings,
    async (_event, patch: unknown) => {
      if (!isDesktopSettingsPatch(patch)) {
        throw new Error('Invalid settings update');
      }

      return settingsService.updateSettings(patch);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.setOverlayHitRegions,
    (_event, hitRegions: unknown): void => {
      if (platform !== 'linux') {
        return;
      }

      const mainWindow = getMainWindow();
      if (!mainWindow) {
        return;
      }

      mainWindow.setShape(toOverlayRectangles(hitRegions));
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.setOverlayPointerPassthrough,
    (_event, enabled: unknown): void => {
      if (typeof enabled !== 'boolean') {
        throw new Error('overlay:setPointerPassthrough requires a boolean');
      }
      if (platform === 'linux') {
        return;
      }

      const mainWindow = getMainWindow();
      if (!mainWindow) {
        return;
      }

      if (enabled) {
        mainWindow.setIgnoreMouseEvents(true, { forward: true });
        return;
      }

      mainWindow.setIgnoreMouseEvents(false);
    },
  );
}
