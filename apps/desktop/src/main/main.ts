import './loadRootEnv';
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
const screenFrameDumpService = createScreenFrameDumpService({
  rootDir: resolveScreenFrameDumpRootDir({
    appPath: app.getAppPath(),
    tempPath: app.getPath('temp'),
  }),
});
registerIpcHandlers({
  captureSourceRegistry,
  getMainWindow,
  screenFrameDumpService,
  settingsService,
});

function handleFatalMainProcessError(scope: string, error: unknown): void {
  console.error(`[desktop:main] ${scope}`, {
    errorMessage: error instanceof Error ? error.message : String(error),
    errorName: error instanceof Error ? error.name : 'Error',
    errorStack: error instanceof Error ? error.stack : undefined,
  });
}

process.on('uncaughtException', (error) => {
  handleFatalMainProcessError('uncaught exception', error);
});

process.on('unhandledRejection', (reason) => {
  handleFatalMainProcessError('unhandled rejection', reason);
});

app.whenReady()
  .then(() => {
    registerDisplayMediaHandler(captureSourceRegistry);
    createWindow();
    app.on('activate', () => {
      handleAppActivate();
    });
  })
  .catch((error) => {
    handleFatalMainProcessError('app whenReady failed', error);
    app.exit(1);
  });

app.on('window-all-closed', () => {
  handleWindowAllClosed();
});

export { createWindow, handleAppActivate, handleWindowAllClosed };
