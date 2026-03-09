import { app, BrowserWindow, ipcMain, screen } from 'electron';
import type { Rectangle } from 'electron';
import { join } from 'path';
import type {
  CreateEphemeralTokenRequest,
} from '@livepair/shared-types';
import {
  IPC_CHANNELS,
} from '../shared/desktopBridge';
import type {
  DesktopSettingsPatch,
  LegacySettingsSnapshot,
} from '../shared/settings';
import { getDesktopSettingsService } from './settings/settingsService';

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-transparent-visuals');
}

let mainWindow: BrowserWindow | null = null;
const settingsService = getDesktopSettingsService();

function toOverlayRectangles(input: unknown): Rectangle[] {
  if (!Array.isArray(input)) {
    throw new Error('overlay:setHitRegions requires an array of rectangles');
  }

  return input.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('overlay:setHitRegions requires an array of rectangles');
    }

    const { x, y, width, height } = entry as Record<string, unknown>;
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      typeof width !== 'number' ||
      typeof height !== 'number' ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height)
    ) {
      throw new Error('overlay:setHitRegions requires an array of rectangles');
    }

    const normalized = {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
    };

    if (normalized.width <= 0 || normalized.height <= 0) {
      throw new Error('overlay:setHitRegions requires positive width and height');
    }

    return normalized;
  });
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyAllowedKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function isThemePreference(value: unknown): boolean {
  return value === 'system' || value === 'light' || value === 'dark';
}

function isPreferredMode(value: unknown): boolean {
  return value === 'fast' || value === 'thinking';
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

const DESKTOP_SETTINGS_PATCH_KEYS = [
  'themePreference',
  'backendUrl',
  'preferredMode',
  'selectedInputDeviceId',
  'selectedOutputDeviceId',
  'isPanelPinned',
] as const;

function isDesktopSettingsPatch(value: unknown): value is DesktopSettingsPatch {
  if (!isPlainRecord(value) || !hasOnlyAllowedKeys(value, DESKTOP_SETTINGS_PATCH_KEYS)) {
    return false;
  }

  if ('themePreference' in value && !isThemePreference(value['themePreference'])) {
    return false;
  }

  if ('backendUrl' in value && typeof value['backendUrl'] !== 'string') {
    return false;
  }

  if ('preferredMode' in value && !isPreferredMode(value['preferredMode'])) {
    return false;
  }

  if ('selectedInputDeviceId' in value && !isNonEmptyString(value['selectedInputDeviceId'])) {
    return false;
  }

  if (
    'selectedOutputDeviceId' in value &&
    !isNonEmptyString(value['selectedOutputDeviceId'])
  ) {
    return false;
  }

  if ('isPanelPinned' in value && typeof value['isPanelPinned'] !== 'boolean') {
    return false;
  }

  return true;
}

const LEGACY_SETTINGS_SNAPSHOT_KEYS = [
  'themePreference',
  'backendUrl',
  'selectedInputDeviceId',
  'selectedOutputDeviceId',
] as const;

function isLegacySettingsSnapshot(value: unknown): value is LegacySettingsSnapshot {
  if (!isPlainRecord(value) || !hasOnlyAllowedKeys(value, LEGACY_SETTINGS_SNAPSHOT_KEYS)) {
    return false;
  }

  if ('themePreference' in value && !isThemePreference(value['themePreference'])) {
    return false;
  }

  if ('backendUrl' in value && typeof value['backendUrl'] !== 'string') {
    return false;
  }

  if ('selectedInputDeviceId' in value && !isNonEmptyString(value['selectedInputDeviceId'])) {
    return false;
  }

  if (
    'selectedOutputDeviceId' in value &&
    !isNonEmptyString(value['selectedOutputDeviceId'])
  ) {
    return false;
  }

  return true;
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

  // On Linux, compositors handle click-through on transparent pixels natively.
  // On macOS/Windows, use setIgnoreMouseEvents + forward for click-through.
  if (process.platform !== 'linux') {
    win.setIgnoreMouseEvents(true, { forward: true });
  } else {
    // Linux compositors differ; start fully click-through and let renderer publish hit regions.
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
  if (platform !== 'darwin') app.quit();
}

ipcMain.handle(IPC_CHANNELS.checkHealth, async () => {
  const { backendUrl } = await settingsService.getSettings();
  const res = await fetch(`${backendUrl}/health`);
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
});

ipcMain.handle(
  IPC_CHANNELS.requestSessionToken,
  async (
    _event,
    req: unknown,
  ) => {
    if (!isCreateEphemeralTokenRequest(req)) {
      throw new Error('Invalid token request payload');
    }

    const { backendUrl } = await settingsService.getSettings();
    const res = await fetch(`${backendUrl}/session/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error(`Token request failed: ${res.status}`);
    return res.json();
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
  IPC_CHANNELS.migrateLegacySettings,
  async (_event, snapshot: unknown) => {
    if (!isLegacySettingsSnapshot(snapshot)) {
      throw new Error('Invalid legacy settings snapshot');
    }

    return settingsService.migrateLegacySettings(snapshot);
  },
);

ipcMain.handle(
  IPC_CHANNELS.setOverlayHitRegions,
  (_event, hitRegions: unknown): void => {
    if (process.platform !== 'linux') {
      return;
    }
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
    if (process.platform === 'linux') {
      return;
    }
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

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    handleAppActivate();
  });
});

app.on('window-all-closed', () => {
  handleWindowAllClosed();
});
