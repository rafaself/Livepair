import { desktopCapturer, ipcMain, screen } from 'electron';
import type { ScreenFrameDumpService } from '../../debug/screenFrameDumpService';
import {
  CAPTURE_SOURCE_LIST_OPTIONS,
  type CaptureSourceRegistry,
  toScreenCaptureOverlayDisplay,
  toCaptureSources,
} from '../../desktopCapture/captureSourceRegistry';
import { getScreenCaptureAccessStatus } from '../../desktopCapture/screenCaptureAccessStatus';
import { IPC_CHANNELS } from '../../../shared';
import {
  isSaveScreenFrameDumpFrameRequest,
  isScreenCaptureSourceId,
} from '../validators/screenValidators';

type RegisterScreenIpcHandlersOptions = {
  captureSourceRegistry: CaptureSourceRegistry;
  platform: NodeJS.Platform;
  screenFrameDumpService: ScreenFrameDumpService;
};

export function registerScreenIpcHandlers({
  captureSourceRegistry,
  platform,
  screenFrameDumpService,
}: RegisterScreenIpcHandlersOptions): void {
  const loadScreenCaptureSourceSnapshot = async () => {
    const sources = toCaptureSources(
      await desktopCapturer.getSources(CAPTURE_SOURCE_LIST_OPTIONS),
    );
    const overlayDisplay = toScreenCaptureOverlayDisplay(screen.getPrimaryDisplay());
    captureSourceRegistry.setSources(sources);

    if (captureSourceRegistry.getSelectedSourceId() === null) {
      const firstScreen = sources.find((source) => source.id.startsWith('screen:'));
      if (firstScreen) {
        captureSourceRegistry.setSelectedSourceId(firstScreen.id);
      }
    }

    return captureSourceRegistry.getSnapshot(overlayDisplay);
  };

  ipcMain.handle(IPC_CHANNELS.getScreenCaptureAccessStatus, async () => {
    return getScreenCaptureAccessStatus(platform);
  });

  ipcMain.handle(IPC_CHANNELS.listScreenCaptureSources, async () => {
    return loadScreenCaptureSourceSnapshot();
  });

  ipcMain.handle(IPC_CHANNELS.selectScreenCaptureSource, async (_event, sourceId: unknown) => {
    if (!isScreenCaptureSourceId(sourceId)) {
      throw new Error('screenCapture:selectSource requires a string or null');
    }

    const snapshot = await loadScreenCaptureSourceSnapshot();

    if (
      sourceId !== null
      && !snapshot.sources.some((source) => source.id === sourceId)
    ) {
      throw new Error('Unknown screen capture source id');
    }

    captureSourceRegistry.setSelectedSourceId(sourceId);
    return {
      ...snapshot,
      selectedSourceId: sourceId,
    };
  });

  ipcMain.handle(IPC_CHANNELS.startScreenFrameDumpSession, async () => {
    return screenFrameDumpService.startSession();
  });

  ipcMain.handle(IPC_CHANNELS.saveScreenFrameDumpFrame, async (_event, request: unknown) => {
    if (!isSaveScreenFrameDumpFrameRequest(request)) {
      throw new Error('Invalid screen frame dump payload');
    }

    await screenFrameDumpService.saveFrame(request);
  });
}
