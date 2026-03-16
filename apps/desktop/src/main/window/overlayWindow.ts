import { app, BrowserWindow, screen } from 'electron';
import { join } from 'path';

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-transparent-visuals');
}

// Suppress harmless Autofill CDP errors from Chromium native log when DevTools opens.
app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication');

let mainWindow: BrowserWindow | null = null;

const DEFAULT_RENDERER_DEV_URL = 'http://localhost:5173';

function resolveRendererDevUrl(): string {
  const configuredUrl = process.env['ELECTRON_RENDERER_URL']?.trim();
  return configuredUrl && configuredUrl.length > 0
    ? configuredUrl
    : DEFAULT_RENDERER_DEV_URL;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

function resolveWindowIconPath(): string | undefined {
  if (process.platform !== 'linux') {
    return undefined;
  }

  return join(app.getAppPath(), 'build/icon.png');
}

export function createWindow(): void {
  const { workArea } = screen.getPrimaryDisplay();
  const icon = resolveWindowIconPath();

  const win = new BrowserWindow({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.on('console-message', (_event, level, message, _line, sourceId) => {
    if (sourceId?.startsWith('devtools://')) return;
    if (level >= 3) {
      console.error('[renderer]', message);
    } else if (level >= 2) {
      console.warn('[renderer]', message);
    } else if (level >= 1) {
      console.log('[renderer]', message);
    }
  });

  if (process.env['NODE_ENV'] === 'development') {
    win.loadURL(resolveRendererDevUrl());
    if (process.env['OPEN_DEVTOOLS'] === 'true') {
      win.webContents.openDevTools({ mode: 'detach' });
    }
    win.webContents.on('before-input-event', (_event, input) => {
      if (input.control && input.shift && input.key.toLowerCase() === 'i') {
        if (win.webContents.isDevToolsOpened()) {
          win.webContents.closeDevTools();
          win.setAlwaysOnTop(true);
        } else {
          win.setAlwaysOnTop(false);
          win.webContents.openDevTools({ mode: 'detach', activate: true });
        }
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

  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });
}

export function handleAppActivate(
  existingWindowsCount: number = BrowserWindow.getAllWindows().length,
): void {
  if (existingWindowsCount === 0) {
    createWindow();
  }
}

export function handleWindowAllClosed(
  platform: NodeJS.Platform = process.platform,
): void {
  if (platform !== 'darwin') {
    app.quit();
  }
}
