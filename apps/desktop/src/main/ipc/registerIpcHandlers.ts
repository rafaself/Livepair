import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/desktopBridge';
import type { DesktopSettingsService } from '../settings/settingsService';
import { createBackendClient } from '../backend/backendClient';
import {
  isCreateEphemeralTokenRequest,
  isDesktopSettingsPatch,
  isTextChatCancelRequest,
  isTextChatRequest,
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
  const activeTextChatStreams = new Map<string, ReturnType<ReturnType<typeof createBackendClient>['startTextChatStream']>>();

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

  ipcMain.handle(
    IPC_CHANNELS.startTextChatStream,
    async (event, req: unknown) => {
      if (!isTextChatRequest(req)) {
        throw new Error('Invalid text chat request payload');
      }

      const streamId = `text-stream-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const handle = backendClient.startTextChatStream(req, {
        onEvent: (streamEvent) => {
          event.sender.send(IPC_CHANNELS.textChatEvent, {
            streamId,
            event: streamEvent,
          });
        },
      });

      activeTextChatStreams.set(streamId, handle);
      void handle.done.finally(() => {
        activeTextChatStreams.delete(streamId);
      });

      return { streamId };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.cancelTextChatStream,
    async (_event, req: unknown) => {
      if (!isTextChatCancelRequest(req)) {
        throw new Error('Invalid text chat cancel payload');
      }

      const activeStream = activeTextChatStreams.get(req.streamId);
      activeStream?.cancel();
      await activeStream?.done;
      activeTextChatStreams.delete(req.streamId);
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
