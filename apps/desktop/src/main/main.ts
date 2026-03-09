import { app, screen } from 'electron';
import type { Display } from 'electron';
import { getDesktopSettingsService } from './settings/settingsService';
import { registerIpcHandlers } from './ipc/registerIpcHandlers';
import {
  createWindow,
  getMainWindow,
  handleAppActivate,
  handleWindowAllClosed,
  listAvailableDisplays,
  logDisplaySnapshot,
  lookupDisplayLabel,
  moveWindowToDisplay,
  setOverlayWindowFocusable,
} from './window/overlayWindow';

export function createDebouncedHandler(
  fn: () => void,
  delayMs: number,
): () => void {
  let timerId: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timerId !== null) {
      clearTimeout(timerId);
    }
    timerId = setTimeout(() => {
      timerId = null;
      fn();
    }, delayMs);
  };
}

const settingsService = getDesktopSettingsService();
registerIpcHandlers({
  getMainWindow,
  listDisplays: listAvailableDisplays,
  lookupDisplayLabel,
  moveWindowToDisplay,
  setOverlayWindowFocusable,
  settingsService,
});

app.whenReady().then(async () => {
  const settings = await settingsService.getSettings();
  createWindow({
    targetDisplayId: settings.selectedOverlayDisplayId,
    targetDisplayLabel: settings.selectedOverlayDisplayLabel,
  });

  const handleDisplayTopologyChange = (): void => {
    void settingsService
      .getSettings()
      .then((currentSettings) => {
        moveWindowToDisplay({
          targetDisplayId: currentSettings.selectedOverlayDisplayId,
          targetDisplayLabel: currentSettings.selectedOverlayDisplayLabel,
        });
      });
  };

  const debouncedHandleMetricsChange = createDebouncedHandler(
    handleDisplayTopologyChange,
    150,
  );

  screen.on('display-added', handleDisplayTopologyChange);
  screen.on('display-removed', handleDisplayTopologyChange);
  screen.on('display-metrics-changed', (_event, display: Display, changedMetrics: string[]) => {
    logDisplaySnapshot(display, 'metrics-changed', { changedMetrics });
    debouncedHandleMetricsChange();
  });

  app.on('activate', () => {
    void settingsService.getSettings().then((currentSettings) => {
      handleAppActivate(undefined, {
        targetDisplayId: currentSettings.selectedOverlayDisplayId,
        targetDisplayLabel: currentSettings.selectedOverlayDisplayLabel,
      });
    });
  });
});

app.on('window-all-closed', () => {
  handleWindowAllClosed();
});

export { createWindow, handleAppActivate, handleWindowAllClosed };
