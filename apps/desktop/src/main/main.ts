import { app } from 'electron';
import { getChatMemoryService } from './chatMemory/chatMemoryService';
import { createCaptureSourceRegistry } from './desktopCapture/captureSourceRegistry';
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
registerIpcHandlers({
  captureSourceRegistry,
  chatMemoryService,
  getMainWindow,
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
