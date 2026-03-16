// @vitest-environment node
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuit = vi.fn();
const mockLoadURL = vi.fn();
const mockLoadFile = vi.fn();
const mockOpenDevTools = vi.fn();
const mockCloseDevTools = vi.fn();
const mockIsDevToolsOpened = vi.fn(() => false);
const mockSetIgnoreMouseEvents = vi.fn();
const mockSetAlwaysOnTop = vi.fn();
const mockSetShape = vi.fn();
const mockWindowOn = vi.fn();
const mockGetAllWindows = vi.fn((): unknown[] => []);
const mockAppendSwitch = vi.fn();
const mockWebContentsOn = vi.fn();
const mockGetPath = vi.fn(() => join(tmpdir(), 'livepair-overlay-window-tests'));
const mockGetAppPath = vi.fn(() => join(tmpdir(), 'livepair-overlay-window-tests'));

const browserWindowCtor = vi.fn(() => ({
  loadURL: mockLoadURL,
  loadFile: mockLoadFile,
  webContents: {
    openDevTools: mockOpenDevTools,
    closeDevTools: mockCloseDevTools,
    isDevToolsOpened: mockIsDevToolsOpened,
    on: mockWebContentsOn,
  },
  setIgnoreMouseEvents: mockSetIgnoreMouseEvents,
  setAlwaysOnTop: mockSetAlwaysOnTop,
  setShape: mockSetShape,
  on: mockWindowOn,
}));

const mockGetPrimaryDisplay = vi.fn(() => ({
  workArea: { x: 0, y: 0, width: 1920, height: 1080 },
}));

vi.mock('electron', () => ({
  app: {
    quit: mockQuit,
    getPath: mockGetPath,
    getAppPath: mockGetAppPath,
    commandLine: { appendSwitch: mockAppendSwitch },
  },
  BrowserWindow: Object.assign(browserWindowCtor, {
    getAllWindows: mockGetAllWindows,
  }),
  screen: { getPrimaryDisplay: mockGetPrimaryDisplay },
}));

describe('overlayWindow', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mockIsDevToolsOpened.mockReturnValue(false);
  });

  it('creates the transparent overlay window and tracks it as the current window', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5174');
    const overlayWindow = await import('./overlayWindow');

    overlayWindow.createWindow();

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
        ...(process.platform === 'linux'
          ? { icon: join(tmpdir(), 'livepair-overlay-window-tests', 'build/icon.png') }
          : {}),
        webPreferences: expect.objectContaining({
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        }),
      }),
    );
    expect(mockLoadURL).toHaveBeenCalledWith('http://localhost:5174');
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

    overlayWindow.createWindow();

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

    expect(mockOpenDevTools).toHaveBeenCalledWith({ mode: 'detach', activate: true });
    expect(mockSetAlwaysOnTop).toHaveBeenCalledWith(false);
    expect(overlayWindow.getMainWindow()).not.toBeNull();

    closedHandler?.();
    expect(overlayWindow.getMainWindow()).toBeNull();
  });

  it('loads the production renderer file and opens devtools only when enabled', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const overlayWindow = await import('./overlayWindow');

    overlayWindow.createWindow();
    expect(mockLoadFile).toHaveBeenCalled();
    expect(mockOpenDevTools).not.toHaveBeenCalled();

    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('OPEN_DEVTOOLS', 'true');
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5174');
    const devOverlayWindow = await import('./overlayWindow');

    devOverlayWindow.createWindow();
    expect(mockOpenDevTools).toHaveBeenCalledWith({ mode: 'detach' });
  });

  it('falls back to the default dev server URL when electron-vite does not inject one', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const overlayWindow = await import('./overlayWindow');

    overlayWindow.createWindow();

    expect(mockLoadURL).toHaveBeenCalledWith('http://localhost:5173');
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

  it('relays renderer console messages to the main process console', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const overlayWindow = await import('./overlayWindow');

    overlayWindow.createWindow();

    const consoleHandler = mockWebContentsOn.mock.calls.find(
      ([eventName]) => eventName === 'console-message',
    )?.[1] as ((_event: unknown, level: number, message: string) => void) | undefined;

    expect(consoleHandler).toBeTypeOf('function');

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    consoleHandler?.({}, 3, 'renderer error');
    expect(errorSpy).toHaveBeenCalledWith('[renderer]', 'renderer error');

    consoleHandler?.({}, 2, 'renderer warning');
    expect(warnSpy).toHaveBeenCalledWith('[renderer]', 'renderer warning');

    consoleHandler?.({}, 1, 'renderer info');
    expect(logSpy).toHaveBeenCalledWith('[renderer]', 'renderer info');

    errorSpy.mockRestore();
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });
});
