import { app, BrowserWindow, screen } from 'electron';
import type { Display, Rectangle } from 'electron';
import { join } from 'path';
import type { DesktopDisplayOption } from '../../shared/desktopBridge';
import { PRIMARY_DISPLAY_ID } from '../../shared/settings';

type DisplaySnapshotReason = 'create' | 'move' | 'metrics-changed' | 'bounds-drift';

export function logDisplaySnapshot(
  display: Display,
  reason: DisplaySnapshotReason,
  extra?: Record<string, unknown>,
): void {
  console.debug('[display-snapshot]', {
    reason,
    id: display.id,
    label: display.label ?? '',
    scaleFactor: display.scaleFactor,
    bounds: display.bounds,
    size: display.size,
    workArea: display.workArea,
    ...extra,
  });
}

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-transparent-visuals');
}

let mainWindow: BrowserWindow | null = null;

type NormalizedDisplayTarget = {
  targetDisplayId: string;
  targetDisplayLabel?: string | undefined;
};

const LINUX_BOUNDS_VERIFY_DELAY_MS = 50;
const LINUX_BOUNDS_RETRY_DELAY_MS = 120;
const MAX_LINUX_BOUNDS_RETRIES = 3;

let placementRequestId = 0;

type ResolveDisplayOptions = {
  targetDisplayId: string;
  targetDisplayLabel?: string | undefined;
  displays?: Display[] | undefined;
  primaryDisplay?: Display | undefined;
};

function resolveDisplay(
  targetDisplayId: string,
  displays?: Display[],
  primaryDisplay?: Display,
): Display;
function resolveDisplay(opts: ResolveDisplayOptions): Display;
function resolveDisplay(
  targetOrOpts: string | ResolveDisplayOptions,
  displaysArg?: Display[],
  primaryArg?: Display,
): Display {
  const targetDisplayId =
    typeof targetOrOpts === 'string' ? targetOrOpts : targetOrOpts.targetDisplayId;
  const targetDisplayLabel =
    typeof targetOrOpts === 'string' ? undefined : targetOrOpts.targetDisplayLabel;
  const displays =
    (typeof targetOrOpts === 'string' ? displaysArg : targetOrOpts.displays) ??
    screen.getAllDisplays();
  const primaryDisplay =
    (typeof targetOrOpts === 'string' ? primaryArg : targetOrOpts.primaryDisplay) ??
    screen.getPrimaryDisplay();

  const resolvedPrimaryDisplay =
    displays.find((display) => display.id === primaryDisplay.id) ??
    displays[0] ??
    primaryDisplay;

  if (targetDisplayId === PRIMARY_DISPLAY_ID) {
    return resolvedPrimaryDisplay;
  }

  // Tier 1: match by display ID
  const byId = displays.find((display) => String(display.id) === targetDisplayId);
  if (byId) {
    return byId;
  }

  // Tier 2: match by connector label (stable across scale changes)
  if (targetDisplayLabel) {
    const byLabel = displays.find(
      (display) => display.label?.trim() === targetDisplayLabel,
    );
    if (byLabel) {
      return byLabel;
    }
  }

  // Tier 3: fall back to primary
  return resolvedPrimaryDisplay;
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
  const dipRes = `${display.bounds.width}x${display.bounds.height}`;

  if (display.scaleFactor && display.scaleFactor !== 1 && display.size) {
    const nativeRes = `${display.size.width}x${display.size.height}`;
    return `${baseLabel} • ${dipRes} (native ${nativeRes})${primarySuffix}`;
  }

  return `${baseLabel} • ${dipRes}${primarySuffix}`;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export type MoveWindowOptions = {
  targetDisplayId?: string | undefined;
  targetDisplayLabel?: string | undefined;
};

function normalizeDisplayTarget(
  targetOrOptions: string | MoveWindowOptions = PRIMARY_DISPLAY_ID,
): NormalizedDisplayTarget {
  return {
    targetDisplayId:
      typeof targetOrOptions === 'string'
        ? targetOrOptions
        : (targetOrOptions.targetDisplayId ?? PRIMARY_DISPLAY_ID),
    targetDisplayLabel:
      typeof targetOrOptions === 'string' ? undefined : targetOrOptions.targetDisplayLabel,
  };
}

function applyWindowBounds(window: BrowserWindow, bounds: Rectangle): void {
  window.setBounds(bounds);
  window.setPosition(bounds.x, bounds.y);
  window.setSize(bounds.width, bounds.height);
}

function applyWindowPlacement(
  window: BrowserWindow,
  target: NormalizedDisplayTarget,
  reason: 'create' | 'move',
  retriesRemaining: number = MAX_LINUX_BOUNDS_RETRIES,
  requestId: number = ++placementRequestId,
): void {
  const resolved = resolveDisplay(target);
  logDisplaySnapshot(resolved, reason, target);
  const bounds = toWindowBounds(resolved);

  applyWindowBounds(window, bounds);
  verifyBoundsAndRetry({
    bounds,
    requestId,
    reason,
    retriesRemaining,
    target,
    window,
  });
}

export function lookupDisplayLabel(displayId: string): string | undefined {
  if (displayId === PRIMARY_DISPLAY_ID) {
    return undefined;
  }
  const display = screen
    .getAllDisplays()
    .find((d) => String(d.id) === displayId);
  return display?.label?.trim() || undefined;
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

export function createWindow(
  targetOrOptions: string | MoveWindowOptions = PRIMARY_DISPLAY_ID,
): void {
  const target = normalizeDisplayTarget(targetOrOptions);
  const resolved = resolveDisplay(target);
  const bounds = toWindowBounds(resolved);

  const win = new BrowserWindow({
    ...bounds,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
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
  mainWindow = win;
  applyWindowPlacement(win, target, 'create');
  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });
}

export function handleAppActivate(
  existingWindowsCount: number = BrowserWindow.getAllWindows().length,
  targetDisplayId: string | MoveWindowOptions = PRIMARY_DISPLAY_ID,
): void {
  if (existingWindowsCount === 0) {
    createWindow(targetDisplayId);
  }
}

export function moveWindowToDisplay(
  targetOrOptions: string | MoveWindowOptions = PRIMARY_DISPLAY_ID,
): void {
  const target = normalizeDisplayTarget(targetOrOptions);
  const window = getMainWindow();

  if (!window) {
    return;
  }

  applyWindowPlacement(window, target, 'move');
}

type VerifyBoundsAndRetryOptions = {
  bounds: Rectangle;
  requestId: number;
  reason: 'create' | 'move';
  retriesRemaining: number;
  target: NormalizedDisplayTarget;
  window: BrowserWindow;
};

function verifyBoundsAndRetry({
  bounds,
  requestId,
  reason,
  retriesRemaining,
  target,
  window,
}: VerifyBoundsAndRetryOptions): void {
  const platform = process.platform;
  if (platform !== 'linux') {
    return;
  }

  setTimeout(() => {
    if (requestId !== placementRequestId) {
      return;
    }
    if (window.isDestroyed()) {
      return;
    }

    const actual = window.getBounds();
    const drift =
      Math.abs(actual.x - bounds.x) +
      Math.abs(actual.y - bounds.y) +
      Math.abs(actual.width - bounds.width) +
      Math.abs(actual.height - bounds.height);

    if (drift > 2) {
      console.debug('[display-snapshot]', {
        reason: 'bounds-drift' as const,
        intended: bounds,
        actual,
        drift,
      });

      if (retriesRemaining <= 0) {
        return;
      }

      setTimeout(() => {
        if (requestId !== placementRequestId) {
          return;
        }
        if (window.isDestroyed()) {
          return;
        }

        applyWindowPlacement(
          window,
          target,
          reason,
          retriesRemaining - 1,
          requestId,
        );
      }, LINUX_BOUNDS_RETRY_DELAY_MS);
    }
  }, LINUX_BOUNDS_VERIFY_DELAY_MS);
}

export function handleWindowAllClosed(
  platform: NodeJS.Platform = process.platform,
): void {
  if (platform !== 'darwin') {
    app.quit();
  }
}
