import { app } from 'electron';
import { join } from 'node:path';
import { getChatMemoryService } from './chatMemory/chatMemoryService';
import { createCaptureSourceRegistry } from './desktopCapture/captureSourceRegistry';
import { createScreenFrameDumpService } from './debug/screenFrameDumpService';
import { registerDisplayMediaHandler } from './desktopCapture/registerDisplayMediaHandler';
import { getDesktopSettingsService } from './settings/settingsService';
import { registerIpcHandlers } from './ipc/registerIpcHandlers';
import {
  createWindow,
  getMainWindow,
  handleAppActivate,
  handleWindowAllClosed,
} from './window/overlayWindow';

const chatMemoryService = getChatMemoryService();
const settingsService = getDesktopSettingsService();
const captureSourceRegistry = createCaptureSourceRegistry();
const screenFrameDumpService = createScreenFrameDumpService({
  rootDir: app.isPackaged
    ? join(app.getPath('temp'), 'livepair', 'screen-frame-dumps')
    : join(app.getAppPath(), 'frames', 'screen-frame-dumps'),
});
registerIpcHandlers({
  captureSourceRegistry,
  chatMemoryService,
  getMainWindow,
  screenFrameDumpService,
  settingsService,
});

app.whenReady().then(() => {
  registerDisplayMediaHandler(captureSourceRegistry);
  createWindow();
  app.on('activate', () => {
    handleAppActivate();
  });
});

app.on('window-all-closed', () => {
  handleWindowAllClosed();
});

export { createWindow, handleAppActivate, handleWindowAllClosed };
