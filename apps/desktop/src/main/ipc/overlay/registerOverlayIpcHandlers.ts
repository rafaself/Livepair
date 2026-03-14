import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../../shared';
import { toOverlayRectangles } from '../validators/overlayValidators';

type RegisterOverlayIpcHandlersOptions = {
  getMainWindow: () => BrowserWindow | null;
  platform: NodeJS.Platform;
};

export function registerOverlayIpcHandlers({
  getMainWindow,
  platform,
}: RegisterOverlayIpcHandlersOptions): void {
  ipcMain.handle(IPC_CHANNELS.setOverlayHitRegions, (_event, hitRegions: unknown): void => {
    if (platform !== 'linux') {
      return;
    }

    const mainWindow = getMainWindow();
    if (!mainWindow) {
      return;
    }

    mainWindow.setShape(toOverlayRectangles(hitRegions));
  });

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
