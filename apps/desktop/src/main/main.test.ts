// @vitest-environment node
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockHandle = vi.fn();
const mockAppOn = vi.fn();
const mockWhenReady = vi.fn(() => Promise.resolve());
const mockQuit = vi.fn();
const mockLoadURL = vi.fn();
const mockSetIgnoreMouseEvents = vi.fn();
const mockSetShape = vi.fn();
const mockSetBounds = vi.fn();
const mockSetPosition = vi.fn();
const mockSetSize = vi.fn();
const mockScreenOn = vi.fn();
const mockWindowOn = vi.fn();
const mockGetAllWindows = vi.fn((): unknown[] => []);
const mockAppendSwitch = vi.fn();
const mockWebContentsOn = vi.fn();
const mockGetPath = vi.fn(() => join(tmpdir(), 'livepair-main-tests'));

const mockGetBounds = vi.fn(() => ({ x: 0, y: 0, width: 1920, height: 1080 }));
const mockIsDestroyed = vi.fn(() => false);

const browserWindowCtor = vi.fn(() => ({
  loadURL: mockLoadURL,
  loadFile: vi.fn(),
  webContents: {
    openDevTools: vi.fn(),
    toggleDevTools: vi.fn(),
    on: mockWebContentsOn,
  },
  setIgnoreMouseEvents: mockSetIgnoreMouseEvents,
  setShape: mockSetShape,
  setBounds: mockSetBounds,
  setPosition: mockSetPosition,
  setSize: mockSetSize,
  getBounds: mockGetBounds,
  isDestroyed: mockIsDestroyed,
  on: mockWindowOn,
}));

const mockGetPrimaryDisplay = vi.fn(() => ({
  id: 1,
  label: 'eDP-1',
  scaleFactor: 1,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  size: { width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1080 },
}));
const mockGetAllDisplays = vi.fn(() => [mockGetPrimaryDisplay()]);

vi.mock('electron', () => ({
  app: {
    whenReady: mockWhenReady,
    on: mockAppOn,
    quit: mockQuit,
    getPath: mockGetPath,
    commandLine: { appendSwitch: mockAppendSwitch },
  },
  ipcMain: { handle: mockHandle },
  BrowserWindow: Object.assign(browserWindowCtor, {
    getAllWindows: mockGetAllWindows,
  }),
  screen: {
    getPrimaryDisplay: mockGetPrimaryDisplay,
    getAllDisplays: mockGetAllDisplays,
    on: mockScreenOn,
  },
}));

describe('main process runtime', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('registers ipc handlers and lifecycle listeners on startup', async () => {
    await import('./main');

    expect(mockWhenReady).toHaveBeenCalledTimes(1);
    expect(mockHandle).toHaveBeenCalledTimes(7);
    expect(mockAppOn).toHaveBeenCalledWith('window-all-closed', expect.any(Function));
  });

  it('creates the overlay window when the app becomes ready', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    await import('./main');
    await Promise.resolve();
    await Promise.resolve();

    expect(mockGetPrimaryDisplay).toHaveBeenCalled();
    expect(browserWindowCtor).toHaveBeenCalledTimes(1);
    expect(mockLoadURL).toHaveBeenCalledWith('http://localhost:5173');
    expect(mockScreenOn).toHaveBeenCalledTimes(3);
  });

  it('routes activate and window-all-closed callbacks through the overlay helpers', async () => {
    await import('./main');
    await Promise.resolve();
    await Promise.resolve();

    const activateHandler = mockAppOn.mock.calls.find(
      ([event]) => event === 'activate',
    )?.[1] as () => void;
    const windowAllClosedHandler = mockAppOn.mock.calls.find(
      ([event]) => event === 'window-all-closed',
    )?.[1] as () => void;

    browserWindowCtor.mockClear();
    mockGetAllWindows.mockReturnValueOnce([]);
    activateHandler();
    await Promise.resolve();
    expect(browserWindowCtor).toHaveBeenCalledTimes(1);

    browserWindowCtor.mockClear();
    mockGetAllWindows.mockReturnValueOnce([{}]);
    activateHandler();
    expect(browserWindowCtor).not.toHaveBeenCalled();

    mockQuit.mockClear();
    windowAllClosedHandler();
    expect(mockQuit).toHaveBeenCalledTimes(1);
  });

  it('uses separate handlers: immediate for display-added/removed, debounced for display-metrics-changed', async () => {
    await import('./main');
    await Promise.resolve();
    await Promise.resolve();

    const displayAddedHandler = mockScreenOn.mock.calls.find(
      ([event]) => event === 'display-added',
    )?.[1];
    const displayRemovedHandler = mockScreenOn.mock.calls.find(
      ([event]) => event === 'display-removed',
    )?.[1];
    const displayMetricsHandler = mockScreenOn.mock.calls.find(
      ([event]) => event === 'display-metrics-changed',
    )?.[1];

    expect(displayAddedHandler).toBeTypeOf('function');
    expect(displayRemovedHandler).toBeTypeOf('function');
    expect(displayMetricsHandler).toBeTypeOf('function');

    // display-added and display-removed share the same immediate handler
    expect(displayAddedHandler).toBe(displayRemovedHandler);
    // display-metrics-changed uses a different (debounced wrapper) handler
    expect(displayMetricsHandler).not.toBe(displayAddedHandler);
  });
});

describe('createDebouncedHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces multiple rapid calls into a single invocation after the delay', async () => {
    const { createDebouncedHandler } = await import('./main');
    const fn = vi.fn();
    const debounced = createDebouncedHandler(fn, 150);

    debounced();
    debounced();
    debounced();

    expect(fn).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(150);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('fires immediately after the delay when only called once', async () => {
    const { createDebouncedHandler } = await import('./main');
    const fn = vi.fn();
    const debounced = createDebouncedHandler(fn, 100);

    debounced();

    await vi.advanceTimersByTimeAsync(99);
    expect(fn).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('resets the delay on each call', async () => {
    const { createDebouncedHandler } = await import('./main');
    const fn = vi.fn();
    const debounced = createDebouncedHandler(fn, 150);

    debounced();
    await vi.advanceTimersByTimeAsync(100);
    debounced(); // resets the timer
    await vi.advanceTimersByTimeAsync(100);
    expect(fn).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
