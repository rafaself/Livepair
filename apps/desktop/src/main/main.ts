import 'dotenv/config';
import { app } from 'electron';
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

const settingsService = getDesktopSettingsService();
const captureSourceRegistry = createCaptureSourceRegistry();
const getExcludedCaptureSourceIds = (): ReadonlySet<string> => {
  const win = getMainWindow();
  return win ? new Set([win.getMediaSourceId()]) : new Set();
};
const screenFrameDumpService = createScreenFrameDumpService({
  rootDir: resolveScreenFrameDumpRootDir({
    appPath: app.getAppPath(),
    tempPath: app.getPath('temp'),
  }),
});
registerIpcHandlers({
  captureSourceRegistry,
  getExcludedSourceIds: getExcludedCaptureSourceIds,
  getMainWindow,
  screenFrameDumpService,
  settingsService,
});

app.whenReady().then(() => {
  registerDisplayMediaHandler(captureSourceRegistry, getExcludedCaptureSourceIds);
  createWindow();
  app.on('activate', () => {
    handleAppActivate();
  });
});

app.on('window-all-closed', () => {
  handleWindowAllClosed();
});

export { createWindow, handleAppActivate, handleWindowAllClosed };
