import type { BrowserWindow } from 'electron';
import {
  createCaptureSourceRegistry,
  type CaptureSourceRegistry,
} from '../desktopCapture/captureSourceRegistry';
import type { ScreenFrameDumpService } from '../debug/screenFrameDumpService';
import type { DesktopSettingsService } from '../settings/settingsService';
import { registerAppIpcHandlers } from './app/registerAppIpcHandlers';
import { registerChatIpcHandlers } from './chat/registerChatIpcHandlers';
import { registerOverlayIpcHandlers } from './overlay/registerOverlayIpcHandlers';
import { registerScreenIpcHandlers } from './screen/registerScreenIpcHandlers';
import { registerSessionIpcHandlers } from './session/registerSessionIpcHandlers';
import { registerSettingsIpcHandlers } from './settings/registerSettingsIpcHandlers';

type RegisterIpcHandlersOptions = {
  captureSourceRegistry?: CaptureSourceRegistry;
  fetchImpl?: typeof fetch;
  getMainWindow: () => BrowserWindow | null;
  platform?: NodeJS.Platform;
  screenFrameDumpService?: ScreenFrameDumpService;
  settingsService: DesktopSettingsService;
};

export function registerIpcHandlers({
  captureSourceRegistry = createCaptureSourceRegistry(),
  fetchImpl,
  getMainWindow,
  platform = process.platform,
  screenFrameDumpService = {
    startSession: async () => ({ directoryPath: '' }),
    saveFrame: async () => undefined,
  },
  settingsService,
}: RegisterIpcHandlersOptions): void {
  registerAppIpcHandlers();
  registerSessionIpcHandlers({
    fetchImpl,
  });
  registerChatIpcHandlers({
    fetchImpl,
  });
  registerSettingsIpcHandlers({
    settingsService,
  });
  registerOverlayIpcHandlers({
    getMainWindow,
    platform,
  });
  registerScreenIpcHandlers({
    captureSourceRegistry,
    platform,
    screenFrameDumpService,
  });
}
