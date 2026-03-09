// @vitest-environment node
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuit = vi.fn();
const mockLoadURL = vi.fn();
const mockLoadFile = vi.fn();
const mockOpenDevTools = vi.fn();
const mockToggleDevTools = vi.fn();
const mockSetIgnoreMouseEvents = vi.fn();
const mockSetShape = vi.fn();
const mockSetBounds = vi.fn();
const mockWindowOn = vi.fn();
const mockGetAllWindows = vi.fn((): unknown[] => []);
const mockAppendSwitch = vi.fn();
const mockWebContentsOn = vi.fn();
const mockGetPath = vi.fn(() => join(tmpdir(), 'livepair-overlay-window-tests'));

const browserWindowCtor = vi.fn(() => ({
  loadURL: mockLoadURL,
  loadFile: mockLoadFile,
  webContents: {
    openDevTools: mockOpenDevTools,
    toggleDevTools: mockToggleDevTools,
    on: mockWebContentsOn,
  },
  setIgnoreMouseEvents: mockSetIgnoreMouseEvents,
  setShape: mockSetShape,
  setBounds: mockSetBounds,
  on: mockWindowOn,
}));

const mockGetPrimaryDisplay = vi.fn(() => ({
  id: 1,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1080 },
}));
const mockGetAllDisplays = vi.fn(() => [
  mockGetPrimaryDisplay(),
  {
    id: 2,
    bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
    workArea: { x: 1920, y: 0, width: 2560, height: 1440 },
  },
]);

vi.mock('electron', () => ({
  app: {
    quit: mockQuit,
    getPath: mockGetPath,
    commandLine: { appendSwitch: mockAppendSwitch },
  },
  BrowserWindow: Object.assign(browserWindowCtor, {
    getAllWindows: mockGetAllWindows,
  }),
  screen: {
    getPrimaryDisplay: mockGetPrimaryDisplay,
    getAllDisplays: mockGetAllDisplays,
  },
}));

describe('overlayWindow', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('creates the transparent overlay window and tracks it as the current window', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const overlayWindow = await import('./overlayWindow');

    overlayWindow.createWindow('primary');

    expect(mockGetPrimaryDisplay).toHaveBeenCalled();
    expect(browserWindowCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        resizable: false,
        skipTaskbar: true,
        hasShadow: false,
        webPreferences: expect.objectContaining({
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        }),
      }),
    );
    expect(mockLoadURL).toHaveBeenCalledWith('http://localhost:5173');
    expect(overlayWindow.getMainWindow()).not.toBeNull();

    if (process.platform !== 'linux') {
      expect(mockSetIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true });
    } else {
      expect(mockSetIgnoreMouseEvents).not.toHaveBeenCalled();
      expect(mockSetShape).toHaveBeenCalledWith([]);
    }
  });

  it('registers the development devtools shortcut and clears the tracked window when closed', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const overlayWindow = await import('./overlayWindow');

    overlayWindow.createWindow('primary');

    const beforeInputHandler = mockWebContentsOn.mock.calls.find(
      ([eventName]) => eventName === 'before-input-event',
    )?.[1] as ((_event: unknown, input: { control?: boolean; shift?: boolean; key: string }) => void) | undefined;
    const closedHandler = mockWindowOn.mock.calls.find(
      ([eventName]) => eventName === 'closed',
    )?.[1] as (() => void) | undefined;

    expect(beforeInputHandler).toBeTypeOf('function');
    expect(closedHandler).toBeTypeOf('function');

    beforeInputHandler?.({}, { control: true, shift: true, key: 'i' });
    beforeInputHandler?.({}, { control: true, shift: false, key: 'i' });

    expect(mockToggleDevTools).toHaveBeenCalledTimes(1);
    expect(overlayWindow.getMainWindow()).not.toBeNull();

    closedHandler?.();
    expect(overlayWindow.getMainWindow()).toBeNull();
  });

  it('loads the production renderer file and opens devtools only when enabled', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const overlayWindow = await import('./overlayWindow');

    overlayWindow.createWindow('primary');
    expect(mockLoadFile).toHaveBeenCalled();
    expect(mockOpenDevTools).not.toHaveBeenCalled();

    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('OPEN_DEVTOOLS', 'true');
    const devOverlayWindow = await import('./overlayWindow');

    devOverlayWindow.createWindow('primary');
    expect(mockOpenDevTools).toHaveBeenCalledWith({ mode: 'detach' });
  });

  it('creates the overlay window on a selected concrete display and can move an existing window later', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const overlayWindow = await import('./overlayWindow');

    overlayWindow.createWindow('2');

    expect(browserWindowCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        x: 1920,
        y: 0,
        width: 2560,
        height: 1440,
      }),
    );

    overlayWindow.moveWindowToDisplay('primary');
    expect(mockSetBounds).toHaveBeenCalledWith({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
  });

  it('forces the target bounds after creating the window so the window manager cannot keep a stale monitor placement', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const overlayWindow = await import('./overlayWindow');

    overlayWindow.createWindow('2');

    expect(mockSetBounds).toHaveBeenCalledWith({
      x: 1920,
      y: 0,
      width: 2560,
      height: 1440,
    });
  });

  it('uses display bounds instead of work area when accessibility settings shrink the work area', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockGetPrimaryDisplay.mockReturnValueOnce({
      id: 1,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 64, y: 0, width: 1856, height: 1080 },
    });
    mockGetAllDisplays.mockReturnValueOnce([
      {
        id: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 64, y: 0, width: 1856, height: 1080 },
      },
      {
        id: 2,
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
        workArea: { x: 1920, y: 0, width: 2560, height: 1440 },
      },
    ]);
    const overlayWindow = await import('./overlayWindow');

    overlayWindow.createWindow('primary');

    expect(browserWindowCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      }),
    );
    expect(mockSetBounds).toHaveBeenCalledWith({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
  });

  it('keeps using Electron primary display instead of the display anchored at the origin', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockGetPrimaryDisplay.mockReturnValueOnce({
      id: 2,
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      workArea: { x: 1920, y: 0, width: 2560, height: 1440 },
    });
    mockGetAllDisplays.mockReturnValueOnce([
      {
        id: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      },
      {
        id: 2,
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
        workArea: { x: 1920, y: 0, width: 2560, height: 1440 },
      },
    ]);
    const overlayWindow = await import('./overlayWindow');

    overlayWindow.createWindow('primary');

    expect(browserWindowCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        x: 1920,
        y: 0,
        width: 2560,
        height: 1440,
      }),
    );
  });

  it('applies the linux transparent visuals switch only on linux', async () => {
    await import('./overlayWindow');

    if (process.platform === 'linux') {
      expect(mockAppendSwitch).toHaveBeenCalledWith('enable-transparent-visuals');
      return;
    }

    expect(mockAppendSwitch).not.toHaveBeenCalled();
  });

  it('recreates or quits the window through the exported lifecycle helpers', async () => {
    const overlayWindow = await import('./overlayWindow');

    browserWindowCtor.mockClear();
    overlayWindow.handleAppActivate(0);
    expect(browserWindowCtor).toHaveBeenCalledTimes(1);

    browserWindowCtor.mockClear();
    overlayWindow.handleAppActivate(1);
    expect(browserWindowCtor).not.toHaveBeenCalled();

    overlayWindow.handleWindowAllClosed('linux');
    expect(mockQuit).toHaveBeenCalledTimes(1);

    mockQuit.mockClear();
    overlayWindow.handleWindowAllClosed('darwin');
    expect(mockQuit).not.toHaveBeenCalled();
  });
});
