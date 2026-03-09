// @vitest-environment node
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockHandle = vi.fn();
const mockAppOn = vi.fn();
const mockWhenReady = vi.fn(() => Promise.resolve());
const mockQuit = vi.fn();
const mockLoadURL = vi.fn();
const mockLoadFile = vi.fn();
const mockOpenDevTools = vi.fn();
const mockToggleDevTools = vi.fn();
const mockSetIgnoreMouseEvents = vi.fn();
const mockSetShape = vi.fn();
const mockWindowOn = vi.fn();
const mockGetAllWindows = vi.fn((): unknown[] => []);
const mockAppendSwitch = vi.fn();
const mockWebContentsOn = vi.fn();
const mockGetPath = vi.fn(() => join(tmpdir(), 'livepair-main-tests'));

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
  on: mockWindowOn,
}));

const mockGetPrimaryDisplay = vi.fn(() => ({
  workArea: { x: 0, y: 0, width: 1920, height: 1080 },
}));

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
  screen: { getPrimaryDisplay: mockGetPrimaryDisplay },
}));

describe('main process runtime', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mockGetPath.mockReturnValue(
      join(tmpdir(), 'livepair-main-tests', `${Date.now()}-${Math.random()}`),
    );
  });

  it('registers IPC handlers for health, token, settings, and overlay IPC', async () => {
    await import('./main');

    expect(mockHandle).toHaveBeenCalledTimes(6);
    expect(mockHandle).toHaveBeenNthCalledWith(
      1,
      'health:check',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      2,
      'session:requestToken',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      3,
      'settings:get',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      4,
      'settings:update',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      5,
      'overlay:setHitRegions',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      6,
      'overlay:setPointerPassthrough',
      expect.any(Function),
    );
  });

  it('creates transparent overlay BrowserWindow and handles dev/prod loading', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const main = await import('./main');

    main.createWindow();
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
    expect(mockOpenDevTools).not.toHaveBeenCalled();

    // On Linux, compositors handle click-through natively — setIgnoreMouseEvents is skipped.
    // On macOS/Windows, it would be called with (true, { forward: true }).
    if (process.platform !== 'linux') {
      expect(mockSetIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true });
    } else {
      expect(mockSetIgnoreMouseEvents).not.toHaveBeenCalled();
      expect(mockSetShape).toHaveBeenCalledWith([]);
    }

    vi.stubEnv('NODE_ENV', 'production');
    main.createWindow();
    expect(mockLoadFile).toHaveBeenCalled();
  });

  it('opens devtools only when OPEN_DEVTOOLS is true', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('OPEN_DEVTOOLS', 'true');
    const main = await import('./main');

    main.createWindow();

    expect(mockOpenDevTools).toHaveBeenCalledWith({ mode: 'detach' });
  });

  it('health IPC handler returns JSON on success and throws on failure', async () => {
    const okResponse = {
      ok: true,
      status: 200,
      json: vi.fn(async () => ({ status: 'ok', timestamp: 't' })),
    };
    const badResponse = { ok: false, status: 503 };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okResponse)
      .mockResolvedValueOnce(badResponse);
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    await import('./main');
    const healthHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'health:check',
    )?.[1] as () => Promise<{ status: 'ok'; timestamp: string }>;

    await expect(healthHandler()).resolves.toEqual({
      status: 'ok',
      timestamp: 't',
    });
    await expect(healthHandler()).rejects.toThrow('Health check failed: 503');
  });

  it('token IPC handler posts JSON with a valid request payload', async () => {
    const okResponse = {
      ok: true,
      status: 200,
      json: vi.fn(async () => ({ token: 'x', expiresAt: 't', isStub: true })),
    };
    const fetchMock = vi.fn().mockResolvedValueOnce(okResponse);
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    await import('./main');
    const tokenHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'session:requestToken',
    )?.[1] as (
      _event: unknown,
      req: { sessionId?: string },
    ) => Promise<{ token: string; expiresAt: string; isStub: true }>;

    await expect(tokenHandler({}, { sessionId: 'abc' })).resolves.toEqual({
      token: 'x',
      expiresAt: 't',
      isStub: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/session/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'abc' }),
      },
    );
  });

  it('token IPC handler rejects invalid payloads before fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    await import('./main');
    const tokenHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'session:requestToken',
    )?.[1] as (_event: unknown, req: unknown) => Promise<unknown>;

    await expect(tokenHandler({}, undefined)).rejects.toThrow(
      'Invalid token request payload',
    );
    await expect(tokenHandler({}, 'bad')).rejects.toThrow(
      'Invalid token request payload',
    );
    await expect(tokenHandler({}, { sessionId: 123 })).rejects.toThrow(
      'Invalid token request payload',
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('token IPC handler throws on non-ok response for a valid payload', async () => {
    const badResponse = { ok: false, status: 401 };
    const fetchMock = vi.fn().mockResolvedValueOnce(badResponse);
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    await import('./main');
    const tokenHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'session:requestToken',
    )?.[1] as (_event: unknown, req: { sessionId?: string }) => Promise<unknown>;

    await expect(tokenHandler({}, {})).rejects.toThrow('Token request failed: 401');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/session/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
    );
  });

  it('gets and updates settings through IPC and uses the persisted backend URL for fetches', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(async () => ({ status: 'ok', timestamp: 't' })),
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    await import('./main');
    const getSettingsHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'settings:get',
    )?.[1] as () => Promise<{ backendUrl: string }>;
    const updateSettingsHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'settings:update',
    )?.[1] as (_event: unknown, patch: unknown) => Promise<{ backendUrl: string }>;
    const healthHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'health:check',
    )?.[1] as () => Promise<{ status: 'ok'; timestamp: string }>;

    await expect(getSettingsHandler()).resolves.toEqual(
      expect.objectContaining({ backendUrl: 'http://localhost:3000' }),
    );
    await expect(
      updateSettingsHandler({}, { backendUrl: ' https://api.livepair.dev/base/ ' }),
    ).resolves.toEqual(expect.objectContaining({ backendUrl: 'https://api.livepair.dev/base' }));
    await expect(getSettingsHandler()).resolves.toEqual(
      expect.objectContaining({ backendUrl: 'https://api.livepair.dev/base' }),
    );

    await healthHandler();

    expect(fetchMock).toHaveBeenLastCalledWith('https://api.livepair.dev/base/health');
  });

  it('rejects invalid settings updates before changing runtime state', async () => {
    await import('./main');
    const updateSettingsHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'settings:update',
    )?.[1] as (_event: unknown, patch: unknown) => Promise<{ backendUrl: string }>;
    const getSettingsHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'settings:get',
    )?.[1] as () => Promise<{ backendUrl: string }>;

    await expect(updateSettingsHandler({}, 'ftp://bad.example.com')).rejects.toThrow(
      'Invalid settings update',
    );
    await expect(
      updateSettingsHandler({}, { backendUrl: 'ftp://bad.example.com' }),
    ).rejects.toThrow('Invalid desktop settings');
    await expect(
      updateSettingsHandler({}, { isPanelPinned: 'yes' }),
    ).rejects.toThrow('Invalid settings update');
    await expect(
      updateSettingsHandler({}, { backendUrl: 'https://api.livepair.dev', extra: true }),
    ).rejects.toThrow('Invalid settings update');
    await expect(
      updateSettingsHandler(
        {},
        Object.assign(Object.create({ injected: true }), {
          backendUrl: 'https://api.livepair.dev',
        }),
      ),
    ).rejects.toThrow('Invalid settings update');
    await expect(getSettingsHandler()).resolves.toEqual(
      expect.objectContaining({ backendUrl: 'http://localhost:3000' }),
    );
  });

  it('overlay hit-region IPC sets Linux shaped input regions', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux', writable: true });

    try {
      const main = await import('./main');
      main.createWindow();
      mockSetShape.mockClear();

      const overlayHandler = mockHandle.mock.calls.find(
        ([channel]) => channel === 'overlay:setHitRegions',
      )?.[1] as (_event: unknown, regions: unknown) => void;

      overlayHandler({}, [{ x: 1, y: 2, width: 30, height: 40 }]);
      expect(mockSetShape).toHaveBeenCalledWith([
        { x: 1, y: 2, width: 30, height: 40 },
      ]);

      expect(() => overlayHandler({}, [{ x: 'bad', y: 2, width: 1, height: 1 }])).toThrow(
        'overlay:setHitRegions requires an array of rectangles',
      );
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
    }
  });

  it('overlay passthrough IPC toggles mouse forwarding on non-linux platforms', async () => {
    if (process.platform === 'linux') {
      return;
    }

    const main = await import('./main');
    main.createWindow();
    mockSetIgnoreMouseEvents.mockClear();

    const passthroughHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'overlay:setPointerPassthrough',
    )?.[1] as (_event: unknown, enabled: boolean) => void;

    passthroughHandler({}, false);
    expect(mockSetIgnoreMouseEvents).toHaveBeenNthCalledWith(1, false);

    passthroughHandler({}, true);
    expect(mockSetIgnoreMouseEvents).toHaveBeenNthCalledWith(2, true, {
      forward: true,
    });
  });

  it('handles app activate and window-all-closed via helper functions', async () => {
    const main = await import('./main');

    browserWindowCtor.mockClear();
    main.handleAppActivate(0);
    expect(browserWindowCtor).toHaveBeenCalledTimes(1);

    browserWindowCtor.mockClear();
    main.handleAppActivate(1);
    expect(browserWindowCtor).not.toHaveBeenCalled();

    main.handleWindowAllClosed('linux');
    expect(mockQuit).toHaveBeenCalledTimes(1);

    mockQuit.mockClear();
    main.handleWindowAllClosed('darwin');
    expect(mockQuit).not.toHaveBeenCalled();
  });

  it('wires activate and window-all-closed callbacks from app lifecycle', async () => {
    await import('./main');

    const activateHandler = mockAppOn.mock.calls.find(
      ([event]) => event === 'activate',
    )?.[1] as () => void;
    const windowAllClosedHandler = mockAppOn.mock.calls.find(
      ([event]) => event === 'window-all-closed',
    )?.[1] as () => void;

    browserWindowCtor.mockClear();
    mockGetAllWindows.mockReturnValueOnce([]);
    activateHandler();
    expect(browserWindowCtor).toHaveBeenCalledTimes(1);

    browserWindowCtor.mockClear();
    mockGetAllWindows.mockReturnValueOnce([{}]);
    activateHandler();
    expect(browserWindowCtor).not.toHaveBeenCalled();

    mockQuit.mockClear();
    windowAllClosedHandler();
    expect(mockQuit).toHaveBeenCalledTimes(1);
  });
});
