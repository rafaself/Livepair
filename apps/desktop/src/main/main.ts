import { app } from 'electron';
import { getChatMemoryService } from './chatMemory/chatMemoryService';
import { createCaptureSourceRegistry } from './desktopCapture/captureSourceRegistry';
import { resolveScreenFrameDumpRootDir } from './debug/screenFrameDumpPaths';
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
  rootDir: resolveScreenFrameDumpRootDir({
    appPath: app.getAppPath(),
    tempPath: app.getPath('temp'),
  }),
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
