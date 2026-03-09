import { app, BrowserWindow, screen } from 'electron';
import type { Display, Rectangle } from 'electron';
import { join } from 'path';
import type { DesktopDisplayOption } from '../../shared/desktopBridge';
import { PRIMARY_DISPLAY_ID } from '../../shared/settings';

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-transparent-visuals');
}

let mainWindow: BrowserWindow | null = null;

function resolveDisplay(
  targetDisplayId: string,
  displays: Display[] = screen.getAllDisplays(),
  primaryDisplay: Display = screen.getPrimaryDisplay(),
): Display {
  const resolvedPrimaryDisplay =
    displays.find((display) => display.id === primaryDisplay.id) ??
    displays[0] ??
    primaryDisplay;

  if (targetDisplayId === PRIMARY_DISPLAY_ID) {
    return resolvedPrimaryDisplay;
  }

  return (
    displays.find((display) => String(display.id) === targetDisplayId) ??
    resolvedPrimaryDisplay
  );
}

function toWindowBounds(display: Display): Rectangle {
  return {
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
  };
}

function buildDisplayLabel(
  display: Display,
  index: number,
  primaryDisplayId: number,
): string {
  const primarySuffix = display.id === primaryDisplayId ? ' (current primary)' : '';
  const baseLabel = display.label?.trim() || `Display ${index + 1}`;
  return `${baseLabel} • ${display.bounds.width}x${display.bounds.height}${primarySuffix}`;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function listAvailableDisplays(): DesktopDisplayOption[] {
  const displays = screen.getAllDisplays();
  const primaryDisplayId = screen.getPrimaryDisplay().id;

  return displays.map((display, index) => ({
    id: String(display.id),
    label: buildDisplayLabel(display, index, primaryDisplayId),
    isPrimary: display.id === primaryDisplayId,
  }));
}

export function createWindow(targetDisplayId: string = PRIMARY_DISPLAY_ID): void {
  const bounds = toWindowBounds(resolveDisplay(targetDisplayId));

  const win = new BrowserWindow({
    ...bounds,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env['NODE_ENV'] === 'development') {
    win.loadURL('http://localhost:5173');
    if (process.env['OPEN_DEVTOOLS'] === 'true') {
      win.webContents.openDevTools({ mode: 'detach' });
    }
    win.webContents.on('before-input-event', (_event, input) => {
      if (input.control && input.shift && input.key.toLowerCase() === 'i') {
        win.webContents.toggleDevTools();
      }
    });
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  if (process.platform !== 'linux') {
    win.setIgnoreMouseEvents(true, { forward: true });
  } else {
    win.setShape([]);
  }

  // Some window managers ignore constructor placement hints for frameless transparent windows.
  // Re-apply the resolved display bounds immediately so the overlay lands on the intended screen.
  win.setBounds(bounds);

  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });
}

export function handleAppActivate(
  existingWindowsCount: number = BrowserWindow.getAllWindows().length,
  targetDisplayId: string = PRIMARY_DISPLAY_ID,
): void {
  if (existingWindowsCount === 0) {
    createWindow(targetDisplayId);
  }
}

export function moveWindowToDisplay(
  targetDisplayId: string = PRIMARY_DISPLAY_ID,
): void {
  const window = getMainWindow();

  if (!window) {
    return;
  }

  window.setBounds(toWindowBounds(resolveDisplay(targetDisplayId)));
}

export function handleWindowAllClosed(
  platform: NodeJS.Platform = process.platform,
): void {
  if (platform !== 'darwin') {
    app.quit();
  }
}
