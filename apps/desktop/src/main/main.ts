import { app } from 'electron';
import { getChatMemoryService } from './chatMemory/chatMemoryService';
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
registerIpcHandlers({ chatMemoryService, getMainWindow, settingsService });

app.whenReady().then(() => {
  registerDisplayMediaHandler();
  createWindow();
  app.on('activate', () => {
    handleAppActivate();
  });
});

app.on('window-all-closed', () => {
  handleWindowAllClosed();
});

export { createWindow, handleAppActivate, handleWindowAllClosed };
