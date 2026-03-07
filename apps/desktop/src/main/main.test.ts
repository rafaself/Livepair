// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockHandle = vi.fn();
const mockAppOn = vi.fn();
const mockWhenReady = vi.fn(() => Promise.resolve());
const mockQuit = vi.fn();
const mockLoadURL = vi.fn();
const mockLoadFile = vi.fn();
const mockOpenDevTools = vi.fn();
const mockGetAllWindows = vi.fn((): unknown[] => []);

const browserWindowCtor = vi.fn(() => ({
  loadURL: mockLoadURL,
  loadFile: mockLoadFile,
  webContents: { openDevTools: mockOpenDevTools },
}));

vi.mock('electron', () => ({
  app: {
    whenReady: mockWhenReady,
    on: mockAppOn,
    quit: mockQuit,
  },
  ipcMain: { handle: mockHandle },
  BrowserWindow: Object.assign(browserWindowCtor, {
    getAllWindows: mockGetAllWindows,
  }),
}));

describe('main process runtime', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('registers IPC handlers for health and token', async () => {
    const main = await import('./main');

    expect(mockHandle).toHaveBeenCalledTimes(2);
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
    expect(main.API_BASE_URL).toBe('http://localhost:3000');
  });

  it('creates secure BrowserWindow options and handles dev/prod loading', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const main = await import('./main');

    main.createWindow();
    expect(browserWindowCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        webPreferences: expect.objectContaining({
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        }),
      }),
    );
    expect(mockLoadURL).toHaveBeenCalledWith('http://localhost:5173');
    expect(mockOpenDevTools).toHaveBeenCalled();

    vi.stubEnv('NODE_ENV', 'production');
    main.createWindow();
    expect(mockLoadFile).toHaveBeenCalled();
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
