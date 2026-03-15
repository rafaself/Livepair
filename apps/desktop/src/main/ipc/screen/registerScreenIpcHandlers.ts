import { desktopCapturer, ipcMain } from 'electron';
import type { ScreenFrameDumpService } from '../../debug/screenFrameDumpService';
import {
  CAPTURE_SOURCE_LIST_OPTIONS,
  type CaptureSourceRegistry,
  filterEligibleCaptureSources,
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
  getExcludedSourceIds?: () => ReadonlySet<string>;
  platform: NodeJS.Platform;
  screenFrameDumpService: ScreenFrameDumpService;
};

export function registerScreenIpcHandlers({
  captureSourceRegistry,
  getExcludedSourceIds = () => new Set(),
  platform,
  screenFrameDumpService,
}: RegisterScreenIpcHandlersOptions): void {
  const loadScreenCaptureSourceSnapshot = async () => {
    const sources = toCaptureSources(filterEligibleCaptureSources(
      await desktopCapturer.getSources(CAPTURE_SOURCE_LIST_OPTIONS),
      getExcludedSourceIds(),
    ));
    captureSourceRegistry.setSources(sources);

    if (captureSourceRegistry.getSelectedSourceId() === null) {
      const firstScreen = sources.find((source) => source.id.startsWith('screen:'));
      if (firstScreen) {
        captureSourceRegistry.setSelectedSourceId(firstScreen.id);
      }
    }

    return captureSourceRegistry.getSnapshot();
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
    return captureSourceRegistry.getSnapshot();
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
