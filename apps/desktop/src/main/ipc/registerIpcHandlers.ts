import { app, desktopCapturer, ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared';
import type { ChatMemoryService } from '../chatMemory/chatMemoryService';
import {
  CAPTURE_SOURCE_LIST_OPTIONS,
  createCaptureSourceRegistry,
  type CaptureSourceRegistry,
  toCaptureSources,
} from '../desktopCapture/captureSourceRegistry';
import { getScreenCaptureAccessStatus } from '../desktopCapture/screenCaptureAccessStatus';
import type { DesktopSettingsService } from '../settings/settingsService';
import { createBackendClient } from '../backend/backendClient';
import {
  isAppendChatMessageRequest,
  isChatId,
  isCreateChatRequest,
  isCreateEphemeralTokenRequest,
  isCreateLiveSessionRequest,
  isDesktopSettingsPatch,
  isEndLiveSessionRequest,
  isScreenCaptureSourceId,
  isUpdateLiveSessionRequest,
  toOverlayRectangles,
} from './validators';

type RegisterIpcHandlersOptions = {
  captureSourceRegistry?: CaptureSourceRegistry;
  chatMemoryService: ChatMemoryService;
  fetchImpl?: typeof fetch;
  getMainWindow: () => BrowserWindow | null;
  platform?: NodeJS.Platform;
  settingsService: DesktopSettingsService;
};

export function registerIpcHandlers({
  captureSourceRegistry = createCaptureSourceRegistry(),
  chatMemoryService,
  fetchImpl = fetch,
  getMainWindow,
  platform = process.platform,
  settingsService,
}: RegisterIpcHandlersOptions): void {
  const backendClient = createBackendClient({
    fetchImpl,
    getBackendUrl: async () => (await settingsService.getSettings()).backendUrl,
  });
  const loadScreenCaptureSourceSnapshot = async () => {
    const sources = toCaptureSources(await desktopCapturer.getSources(CAPTURE_SOURCE_LIST_OPTIONS));
    captureSourceRegistry.setSources(sources);
    return captureSourceRegistry.getSnapshot();
  };

  ipcMain.handle(IPC_CHANNELS.quitApp, () => {
    app.quit();
  });

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
    IPC_CHANNELS.createChat,
    async (_event, req: unknown) => {
      if (!isCreateChatRequest(req)) {
        throw new Error('Invalid create chat payload');
      }

      return chatMemoryService.createChat(req);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.getChat,
    async (_event, chatId: unknown) => {
      if (!isChatId(chatId)) {
        throw new Error('Invalid chat id');
      }

      return chatMemoryService.getChat(chatId);
    },
  );

  ipcMain.handle(IPC_CHANNELS.getOrCreateCurrentChat, async () => {
    return chatMemoryService.getOrCreateCurrentChat();
  });

  ipcMain.handle(IPC_CHANNELS.listChats, async () => {
    return chatMemoryService.listChats();
  });

  ipcMain.handle(
    IPC_CHANNELS.listChatMessages,
    async (_event, chatId: unknown) => {
      if (!isChatId(chatId)) {
        throw new Error('Invalid chat id');
      }

      return chatMemoryService.listMessages(chatId);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.getChatSummary,
    async (_event, chatId: unknown) => {
      if (!isChatId(chatId)) {
        throw new Error('Invalid chat id');
      }

      return chatMemoryService.getChatSummary(chatId);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.appendChatMessage,
    async (_event, req: unknown) => {
      if (!isAppendChatMessageRequest(req)) {
        throw new Error('Invalid append chat message payload');
      }

      return chatMemoryService.appendMessage(req);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.createLiveSession,
    async (_event, req: unknown) => {
      if (!isCreateLiveSessionRequest(req)) {
        throw new Error('Invalid create live session payload');
      }

      return chatMemoryService.createLiveSession(req);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.listLiveSessions,
    async (_event, chatId: unknown) => {
      if (!isChatId(chatId)) {
        throw new Error('Invalid chat id');
      }

      return chatMemoryService.listLiveSessions(chatId);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.updateLiveSession,
    async (_event, req: unknown) => {
      if (!isUpdateLiveSessionRequest(req)) {
        throw new Error('Invalid update live session payload');
      }

      return chatMemoryService.updateLiveSession(req);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.endLiveSession,
    async (_event, req: unknown) => {
      if (!isEndLiveSessionRequest(req)) {
        throw new Error('Invalid end live session payload');
      }

      return chatMemoryService.endLiveSession(req);
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

  ipcMain.handle(IPC_CHANNELS.getScreenCaptureAccessStatus, async () => {
    return getScreenCaptureAccessStatus(platform);
  });

  ipcMain.handle(IPC_CHANNELS.listScreenCaptureSources, async () => {
    return loadScreenCaptureSourceSnapshot();
  });

  ipcMain.handle(
    IPC_CHANNELS.selectScreenCaptureSource,
    async (_event, sourceId: unknown) => {
      if (!isScreenCaptureSourceId(sourceId)) {
        throw new Error('screenCapture:selectSource requires a string or null');
      }

      const snapshot = await loadScreenCaptureSourceSnapshot();

      if (
        sourceId !== null &&
        !snapshot.sources.some((source) => source.id === sourceId)
      ) {
        throw new Error('Unknown screen capture source id');
      }

      captureSourceRegistry.setSelectedSourceId(sourceId);
      return captureSourceRegistry.getSnapshot();
    },
  );
}
