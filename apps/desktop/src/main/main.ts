import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { join } from 'path';
import type {
  HealthResponse,
  CreateEphemeralTokenRequest,
  CreateEphemeralTokenResponse,
} from '@livepair/shared-types';

export const API_BASE_URL = process.env['API_BASE_URL'] ?? 'http://localhost:3000';

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-transparent-visuals');
}

function isCreateEphemeralTokenRequest(
  req: unknown,
): req is CreateEphemeralTokenRequest {
  if (typeof req !== 'object' || req === null || Array.isArray(req)) {
    return false;
  }

  if (!('sessionId' in req)) {
    return true;
  }

  const sessionId = (req as { sessionId?: unknown }).sessionId;
  return typeof sessionId === 'string' || typeof sessionId === 'undefined';
}

export function createWindow(): void {
  const { workArea } = screen.getPrimaryDisplay();

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
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env['NODE_ENV'] === 'development') {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
    win.webContents.on('before-input-event', (_event, input) => {
      if (input.control && input.shift && input.key.toLowerCase() === 'i') {
        win.webContents.toggleDevTools();
      }
    });
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // On Linux, compositors handle click-through on transparent pixels natively.
  // On macOS/Windows, use setIgnoreMouseEvents + forward for click-through.
  if (process.platform !== 'linux') {
    win.setIgnoreMouseEvents(true, { forward: true });
  }
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
  if (platform !== 'darwin') app.quit();
}

ipcMain.handle('health:check', async (): Promise<HealthResponse> => {
  const res = await fetch(`${API_BASE_URL}/health`);
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json() as Promise<HealthResponse>;
});

ipcMain.handle(
  'session:requestToken',
  async (
    _event,
    req: unknown,
  ): Promise<CreateEphemeralTokenResponse> => {
    if (!isCreateEphemeralTokenRequest(req)) {
      throw new Error('Invalid token request payload');
    }

    const res = await fetch(`${API_BASE_URL}/session/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error(`Token request failed: ${res.status}`);
    return res.json() as Promise<CreateEphemeralTokenResponse>;
  },
);

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    handleAppActivate();
  });
});

app.on('window-all-closed', () => {
  handleWindowAllClosed();
});
