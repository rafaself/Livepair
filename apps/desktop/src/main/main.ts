import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import type {
  HealthResponse,
  CreateEphemeralTokenRequest,
  CreateEphemeralTokenResponse,
} from '@livepair/shared-types';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 900,
    height: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
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
    req: CreateEphemeralTokenRequest,
  ): Promise<CreateEphemeralTokenResponse> => {
    const res = await fetch(`${API_BASE_URL}/session/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req ?? {}),
    });
    if (!res.ok) throw new Error(`Token request failed: ${res.status}`);
    return res.json() as Promise<CreateEphemeralTokenResponse>;
  },
);

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
