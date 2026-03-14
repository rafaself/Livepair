import { app, ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared';

export function registerAppIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.quitApp, () => {
    app.quit();
  });
}
