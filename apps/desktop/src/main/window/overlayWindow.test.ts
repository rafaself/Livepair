// @vitest-environment node
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let currentBounds = { x: 0, y: 0, width: 1920, height: 1080 };

const mockQuit = vi.fn();
const mockLoadURL = vi.fn();
const mockLoadFile = vi.fn();
const mockOpenDevTools = vi.fn();
const mockToggleDevTools = vi.fn();
const mockSetIgnoreMouseEvents = vi.fn();
const mockSetShape = vi.fn();
const mockSetBounds = vi.fn((bounds: typeof currentBounds) => {
  currentBounds = { ...bounds };
});
const mockSetPosition = vi.fn((x: number, y: number) => {
  currentBounds = {
    ...currentBounds,
    x,
    y,
  };
});
const mockSetSize = vi.fn((width: number, height: number) => {
  currentBounds = {
    ...currentBounds,
    width,
    height,
  };
});
const mockGetBounds = vi.fn(() => ({ ...currentBounds }));
const mockIsDestroyed = vi.fn(() => false);
const mockDestroy = vi.fn();
const mockWindowOn = vi.fn();
const mockGetAllWindows = vi.fn((): unknown[] => []);
const mockAppendSwitch = vi.fn();
const mockWebContentsOn = vi.fn();
const mockGetPath = vi.fn(() => join(tmpdir(), 'livepair-overlay-window-tests'));

const browserWindowCtor = vi.fn((options: typeof currentBounds) => {
  currentBounds = {
    x: options.x,
    y: options.y,
    width: options.width,
    height: options.height,
  };

  return {
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
    setPosition: mockSetPosition,
    setSize: mockSetSize,
    getBounds: mockGetBounds,
    isDestroyed: mockIsDestroyed,
    destroy: mockDestroy,
    on: mockWindowOn,
  };
});

const mockGetPrimaryDisplay = vi.fn(() => ({
  id: 1,
  label: 'eDP-1',
  scaleFactor: 1,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  size: { width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1080 },
}));
const mockGetAllDisplays = vi.fn(() => [
  mockGetPrimaryDisplay(),
  {
    id: 2,
    label: 'HDMI-1',
    scaleFactor: 1,
    bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
    size: { width: 2560, height: 1440 },
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
    vi.useFakeTimers();
    currentBounds = { x: 0, y: 0, width: 1920, height: 1080 };
  });

  afterEach(async () => {
    await vi.runOnlyPendingTimersAsync();
    vi.useRealTimers();
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
        resizable: true,
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
      label: 'eDP-1',
      scaleFactor: 1,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      size: { width: 1920, height: 1080 },
      workArea: { x: 64, y: 0, width: 1856, height: 1080 },
    });
    mockGetAllDisplays.mockReturnValueOnce([
      {
        id: 1,
        label: 'eDP-1',
        scaleFactor: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        size: { width: 1920, height: 1080 },
        workArea: { x: 64, y: 0, width: 1856, height: 1080 },
      },
      {
        id: 2,
        label: 'HDMI-1',
        scaleFactor: 1,
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
        size: { width: 2560, height: 1440 },
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
      label: 'HDMI-1',
      scaleFactor: 1,
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      size: { width: 2560, height: 1440 },
      workArea: { x: 1920, y: 0, width: 2560, height: 1440 },
    });
    mockGetAllDisplays.mockReturnValueOnce([
      {
        id: 1,
        label: 'eDP-1',
        scaleFactor: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        size: { width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      },
      {
        id: 2,
        label: 'HDMI-1',
        scaleFactor: 1,
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
        size: { width: 2560, height: 1440 },
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

  it('uses DIP bounds correctly when primary display has a scale factor', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockGetPrimaryDisplay.mockReturnValueOnce({
      id: 1,
      label: 'eDP-1',
      scaleFactor: 1.25,
      bounds: { x: 0, y: 0, width: 1536, height: 864 },
      size: { width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1536, height: 864 },
    });
    mockGetAllDisplays.mockReturnValueOnce([
      {
        id: 1,
        label: 'eDP-1',
        scaleFactor: 1.25,
        bounds: { x: 0, y: 0, width: 1536, height: 864 },
        size: { width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1536, height: 864 },
      },
      {
        id: 2,
        label: 'HDMI-1',
        scaleFactor: 1,
        bounds: { x: 1536, y: 0, width: 2560, height: 1440 },
        size: { width: 2560, height: 1440 },
        workArea: { x: 1536, y: 0, width: 2560, height: 1440 },
      },
    ]);
    const overlayWindow = await import('./overlayWindow');

    overlayWindow.createWindow('primary');

    expect(browserWindowCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        x: 0,
        y: 0,
        width: 1536,
        height: 864,
      }),
    );
  });

  it('positions on the correct secondary display when primary scale factor shifts DIP coordinates', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockGetPrimaryDisplay.mockReturnValueOnce({
      id: 1,
      label: 'eDP-1',
      scaleFactor: 1.25,
      bounds: { x: 0, y: 0, width: 1536, height: 864 },
      size: { width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1536, height: 864 },
    });
    mockGetAllDisplays.mockReturnValueOnce([
      {
        id: 1,
        label: 'eDP-1',
        scaleFactor: 1.25,
        bounds: { x: 0, y: 0, width: 1536, height: 864 },
        size: { width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1536, height: 864 },
      },
      {
        id: 2,
        label: 'HDMI-1',
        scaleFactor: 1,
        bounds: { x: 1536, y: 0, width: 2560, height: 1440 },
        size: { width: 2560, height: 1440 },
        workArea: { x: 1536, y: 0, width: 2560, height: 1440 },
      },
    ]);
    const overlayWindow = await import('./overlayWindow');

    overlayWindow.createWindow('2');

    expect(browserWindowCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        x: 1536,
        y: 0,
        width: 2560,
        height: 1440,
      }),
    );
  });

  it('falls back to label-based matching when display ID is not found', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    // Display IDs shifted (3 instead of 2) but label stays stable
    mockGetAllDisplays.mockReturnValueOnce([
      mockGetPrimaryDisplay(),
      {
        id: 3,
        label: 'HDMI-1',
        scaleFactor: 1,
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
        size: { width: 2560, height: 1440 },
        workArea: { x: 1920, y: 0, width: 2560, height: 1440 },
      },
    ]);
    const overlayWindow = await import('./overlayWindow');

    overlayWindow.createWindow('primary');

    // Move with options including label fallback — ID '2' no longer exists but 'HDMI-1' does
    overlayWindow.moveWindowToDisplay({
      targetDisplayId: '2',
      targetDisplayLabel: 'HDMI-1',
    });

    expect(mockSetBounds).toHaveBeenLastCalledWith({
      x: 1920,
      y: 0,
      width: 2560,
      height: 1440,
    });
  });

  it('falls back to primary display when neither ID nor label matches', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const overlayWindow = await import('./overlayWindow');

    overlayWindow.createWindow('primary');

    overlayWindow.moveWindowToDisplay({
      targetDisplayId: '999',
      targetDisplayLabel: 'VGA-1',
    });

    expect(mockSetBounds).toHaveBeenLastCalledWith({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
  });

  it('retries applying bounds in place when the WM refuses the first move on Linux', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const overlayWindow = await import('./overlayWindow');
    overlayWindow.createWindow('primary');
    const initialCtorCount = browserWindowCtor.mock.calls.length;

    // Simulate WM placing the window on a different display
    mockGetBounds.mockReturnValueOnce({ x: 1920, y: 0, width: 1920, height: 1080 });
    mockSetBounds.mockClear();

    overlayWindow.moveWindowToDisplay('primary');

    // First applyWindowBounds call from moveWindowToDisplay
    expect(mockSetBounds).toHaveBeenCalledTimes(1);

    // Advance past the verification delay and the first retry delay
    await vi.advanceTimersByTimeAsync(180);

    if (process.platform === 'linux') {
      expect(mockDestroy).not.toHaveBeenCalled();
      expect(browserWindowCtor.mock.calls.length).toBe(initialCtorCount);
      expect(mockSetBounds).toHaveBeenCalledTimes(2);
      expect(mockSetPosition).toHaveBeenLastCalledWith(0, 0);
      expect(mockSetSize).toHaveBeenLastCalledWith(1920, 1080);
    } else {
      expect(mockDestroy).not.toHaveBeenCalled();
      expect(mockSetBounds).toHaveBeenCalledTimes(1);
    }
  });

  it('retries startup placement in place when constructor placement drifts on Linux', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const overlayWindow = await import('./overlayWindow');

    mockGetBounds
      .mockReturnValueOnce({ x: 1920, y: 0, width: 1919, height: 1079 })
      .mockReturnValueOnce({ x: 0, y: 0, width: 1920, height: 1080 });

    overlayWindow.createWindow('primary');

    await vi.advanceTimersByTimeAsync(180);

    if (process.platform === 'linux') {
      expect(mockDestroy).not.toHaveBeenCalled();
      expect(browserWindowCtor).toHaveBeenCalledTimes(1);
      expect(mockSetBounds).toHaveBeenCalledTimes(2);
      expect(mockSetPosition).toHaveBeenLastCalledWith(0, 0);
      expect(mockSetSize).toHaveBeenLastCalledWith(1920, 1080);
    } else {
      expect(mockDestroy).not.toHaveBeenCalled();
      expect(browserWindowCtor).toHaveBeenCalledTimes(1);
    }
  });

  it('stops retrying after the bounded in-place attempts are exhausted', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    mockGetBounds.mockReturnValue({
      x: 1920,
      y: 0,
      width: 1919,
      height: 1079,
    });

    const overlayWindow = await import('./overlayWindow');
    overlayWindow.createWindow('primary');
    mockSetBounds.mockClear();

    overlayWindow.moveWindowToDisplay('primary');

    if (process.platform === 'linux') {
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockDestroy).not.toHaveBeenCalled();
      expect(mockSetBounds).toHaveBeenCalledTimes(4);
    } else {
      expect(mockSetBounds).toHaveBeenCalledTimes(1);
    }
  });

  it('does not retry setBounds when the WM drift is within tolerance', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const overlayWindow = await import('./overlayWindow');
    overlayWindow.createWindow('primary');

    // Simulate minor rounding: 1px total drift (within threshold of 2)
    mockGetBounds.mockReturnValueOnce({ x: 1, y: 0, width: 1920, height: 1080 });
    mockSetBounds.mockClear();

    overlayWindow.moveWindowToDisplay('primary');

    await vi.advanceTimersByTimeAsync(50);

    // Only the initial setBounds, no retry
    expect(mockSetBounds).toHaveBeenCalledTimes(1);
  });

  it('does not retry setBounds if the window is destroyed before verification', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const overlayWindow = await import('./overlayWindow');
    overlayWindow.createWindow('primary');

    mockIsDestroyed.mockReturnValueOnce(true);
    mockSetBounds.mockClear();

    overlayWindow.moveWindowToDisplay('primary');

    await vi.advanceTimersByTimeAsync(50);

    // Only the initial setBounds, no retry since window is destroyed
    expect(mockSetBounds).toHaveBeenCalledTimes(1);
  });

  it('includes native resolution in display label when scale factor is not 1', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockGetPrimaryDisplay.mockReturnValueOnce({
      id: 1,
      label: 'eDP-1',
      scaleFactor: 1.25,
      bounds: { x: 0, y: 0, width: 1536, height: 864 },
      size: { width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1536, height: 864 },
    });
    mockGetAllDisplays.mockReturnValueOnce([
      {
        id: 1,
        label: 'eDP-1',
        scaleFactor: 1.25,
        bounds: { x: 0, y: 0, width: 1536, height: 864 },
        size: { width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1536, height: 864 },
      },
    ]);
    const overlayWindow = await import('./overlayWindow');

    const displays = overlayWindow.listAvailableDisplays();

    expect(displays[0]!.label).toBe('eDP-1 • 1536x864 (native 1920x1080) (current primary)');
  });

  it('omits native resolution from display label when scale factor is 1', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const overlayWindow = await import('./overlayWindow');

    const displays = overlayWindow.listAvailableDisplays();

    expect(displays[0]!.label).toBe('eDP-1 • 1920x1080 (current primary)');
    expect(displays[1]!.label).toBe('HDMI-1 • 2560x1440');
  });

  it('emits diagnostic logs when creating and moving windows', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const overlayWindow = await import('./overlayWindow');

    overlayWindow.createWindow('primary');

    expect(debugSpy).toHaveBeenCalledWith(
      '[display-snapshot]',
      expect.objectContaining({
        reason: 'create',
        id: 1,
        targetDisplayId: 'primary',
      }),
    );

    debugSpy.mockClear();
    overlayWindow.moveWindowToDisplay('2');

    expect(debugSpy).toHaveBeenCalledWith(
      '[display-snapshot]',
      expect.objectContaining({
        reason: 'move',
        id: 2,
        targetDisplayId: '2',
      }),
    );

    debugSpy.mockRestore();
  });

  it('lookupDisplayLabel returns the connector label for a known display ID', async () => {
    const overlayWindow = await import('./overlayWindow');

    expect(overlayWindow.lookupDisplayLabel('2')).toBe('HDMI-1');
    expect(overlayWindow.lookupDisplayLabel('primary')).toBeUndefined();
    expect(overlayWindow.lookupDisplayLabel('999')).toBeUndefined();
  });

  it('keeps the saved dock display target across ID churn, fallback, and recovery', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const overlayWindow = await import('./overlayWindow');
    const savedTarget = {
      targetDisplayId: '2',
      targetDisplayLabel: 'HDMI-1',
    };

    overlayWindow.createWindow(savedTarget);
    expect(browserWindowCtor).toHaveBeenLastCalledWith(
      expect.objectContaining({
        x: 1920,
        y: 0,
        width: 2560,
        height: 1440,
      }),
    );

    mockGetAllDisplays.mockReturnValueOnce([
      mockGetPrimaryDisplay(),
      {
        id: 3,
        label: 'HDMI-1',
        scaleFactor: 1,
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
        size: { width: 2560, height: 1440 },
        workArea: { x: 1920, y: 32, width: 2560, height: 1408 },
      },
    ]);
    overlayWindow.moveWindowToDisplay(savedTarget);
    expect(mockSetBounds).toHaveBeenLastCalledWith({
      x: 1920,
      y: 0,
      width: 2560,
      height: 1440,
    });

    mockGetAllDisplays.mockReturnValueOnce([mockGetPrimaryDisplay()]);
    overlayWindow.moveWindowToDisplay(savedTarget);
    expect(mockSetBounds).toHaveBeenLastCalledWith({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });

    mockGetAllDisplays.mockReturnValueOnce([
      mockGetPrimaryDisplay(),
      {
        id: 4,
        label: 'HDMI-1',
        scaleFactor: 1,
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
        size: { width: 2560, height: 1440 },
        workArea: { x: 1920, y: 48, width: 2560, height: 1392 },
      },
    ]);
    overlayWindow.moveWindowToDisplay(savedTarget);
    expect(mockSetBounds).toHaveBeenLastCalledWith({
      x: 1920,
      y: 0,
      width: 2560,
      height: 1440,
    });
  });
});
