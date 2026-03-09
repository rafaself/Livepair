// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import type { DesktopSettings } from '../../shared/settings';
import type { DesktopSettingsService } from '../settings/settingsService';

const mockHandle = vi.fn();

vi.mock('electron', () => ({
  ipcMain: { handle: mockHandle },
}));

const defaultSettings: DesktopSettings = {
  themePreference: 'system',
  backendUrl: 'http://localhost:3000',
  preferredMode: 'fast',
  selectedInputDeviceId: 'default',
  selectedOutputDeviceId: 'default',
  isPanelPinned: false,
};

function createSettingsServiceDouble(): DesktopSettingsService {
  return {
    getSettings: vi.fn(async () => defaultSettings),
    updateSettings: vi.fn(),
  } as unknown as DesktopSettingsService;
}

function createMainWindowDouble(): BrowserWindow {
  return {
    setShape: vi.fn(),
    setIgnoreMouseEvents: vi.fn(),
  } as unknown as BrowserWindow;
}

describe('registerIpcHandlers', () => {
  beforeEach(() => {
    vi.resetModules();
    mockHandle.mockReset();
  });

  it('registers the expected IPC channels', async () => {
    const { registerIpcHandlers } = await import('./registerIpcHandlers');

    registerIpcHandlers({
      getMainWindow: () => null,
      settingsService: createSettingsServiceDouble(),
    });

    expect(mockHandle).toHaveBeenCalledTimes(6);
    expect(mockHandle).toHaveBeenNthCalledWith(1, 'health:check', expect.any(Function));
    expect(mockHandle).toHaveBeenNthCalledWith(
      2,
      'session:requestToken',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(3, 'settings:get', expect.any(Function));
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

  it('validates token request payloads before delegating to the backend client', async () => {
    const fetchImpl = vi.fn();
    const settingsService = createSettingsServiceDouble();
    const { registerIpcHandlers } = await import('./registerIpcHandlers');

    registerIpcHandlers({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getMainWindow: () => null,
      settingsService,
    });

    const tokenHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'session:requestToken',
    )?.[1] as (_event: unknown, req: unknown) => Promise<unknown>;

    await expect(tokenHandler({}, { sessionId: 12 })).rejects.toThrow(
      'Invalid token request payload',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('delegates health, token, and settings handlers to the backend client and settings service', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn(async () => ({ status: 'ok', timestamp: 'now' })),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn(async () => ({ token: 'stub-token', expiresAt: 'later', isStub: true })),
      });
    const settingsService = createSettingsServiceDouble();
    vi.mocked(settingsService.updateSettings).mockResolvedValue({
      ...defaultSettings,
      backendUrl: 'https://api.livepair.dev',
    });
    const { registerIpcHandlers } = await import('./registerIpcHandlers');

    registerIpcHandlers({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getMainWindow: () => null,
      settingsService,
    });

    const healthHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'health:check',
    )?.[1] as () => Promise<unknown>;
    const tokenHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'session:requestToken',
    )?.[1] as (_event: unknown, req: { sessionId?: string }) => Promise<unknown>;
    const getSettingsHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'settings:get',
    )?.[1] as () => Promise<unknown>;
    const updateSettingsHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'settings:update',
    )?.[1] as (_event: unknown, patch: unknown) => Promise<unknown>;

    await expect(healthHandler()).resolves.toEqual({ status: 'ok', timestamp: 'now' });
    await expect(tokenHandler({}, { sessionId: 'session-1' })).resolves.toEqual({
      token: 'stub-token',
      expiresAt: 'later',
      isStub: true,
    });
    await expect(getSettingsHandler()).resolves.toEqual(defaultSettings);
    await expect(
      updateSettingsHandler({}, { backendUrl: 'https://api.livepair.dev' }),
    ).resolves.toEqual({
      ...defaultSettings,
      backendUrl: 'https://api.livepair.dev',
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'http://localhost:3000/health');
    expect(fetchImpl).toHaveBeenNthCalledWith(2, 'http://localhost:3000/session/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'session-1' }),
    });
    expect(settingsService.getSettings).toHaveBeenCalledTimes(3);
    expect(settingsService.updateSettings).toHaveBeenCalledWith({
      backendUrl: 'https://api.livepair.dev',
    });
  });

  it('rejects invalid settings updates before touching the settings service', async () => {
    const settingsService = createSettingsServiceDouble();
    const { registerIpcHandlers } = await import('./registerIpcHandlers');

    registerIpcHandlers({
      getMainWindow: () => null,
      settingsService,
    });

    const updateSettingsHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'settings:update',
    )?.[1] as (_event: unknown, patch: unknown) => Promise<unknown>;

    await expect(updateSettingsHandler({}, { isPanelPinned: 'yes' })).rejects.toThrow(
      'Invalid settings update',
    );
    expect(settingsService.updateSettings).not.toHaveBeenCalled();
  });

  it('routes overlay operations through the current window with platform-aware behavior', async () => {
    const mainWindow = createMainWindowDouble();
    const setShape = vi.mocked(mainWindow.setShape);
    const setIgnoreMouseEvents = vi.mocked(mainWindow.setIgnoreMouseEvents);
    const getMainWindow = vi.fn(() => mainWindow);
    const settingsService = createSettingsServiceDouble();
    const { registerIpcHandlers } = await import('./registerIpcHandlers');

    registerIpcHandlers({
      getMainWindow,
      platform: 'linux',
      settingsService,
    });

    const regionsHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'overlay:setHitRegions',
    )?.[1] as (_event: unknown, regions: unknown) => void;

    regionsHandler({}, [{ x: 1.2, y: 2.2, width: 3.1, height: 4.9 }]);
    expect(setShape).toHaveBeenCalledWith([{ x: 1, y: 2, width: 3, height: 5 }]);

    mockHandle.mockReset();
    registerIpcHandlers({
      getMainWindow,
      platform: 'win32',
      settingsService,
    });

    const passthroughHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'overlay:setPointerPassthrough',
    )?.[1] as (_event: unknown, enabled: unknown) => void;

    expect(() => passthroughHandler({}, 'bad')).toThrow(
      'overlay:setPointerPassthrough requires a boolean',
    );

    passthroughHandler({}, true);
    passthroughHandler({}, false);

    expect(setIgnoreMouseEvents).toHaveBeenNthCalledWith(1, true, { forward: true });
    expect(setIgnoreMouseEvents).toHaveBeenNthCalledWith(2, false);
  });

  it('skips overlay work when the active platform does not support that operation', async () => {
    const getMainWindow = vi.fn(() => createMainWindowDouble());
    const settingsService = createSettingsServiceDouble();
    const { registerIpcHandlers } = await import('./registerIpcHandlers');

    registerIpcHandlers({
      getMainWindow,
      platform: 'win32',
      settingsService,
    });

    const regionsHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'overlay:setHitRegions',
    )?.[1] as (_event: unknown, regions: unknown) => void;

    regionsHandler({}, [{ x: 1, y: 2, width: 3, height: 4 }]);
    expect(getMainWindow).not.toHaveBeenCalled();

    mockHandle.mockReset();
    registerIpcHandlers({
      getMainWindow,
      platform: 'linux',
      settingsService,
    });

    const passthroughHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'overlay:setPointerPassthrough',
    )?.[1] as (_event: unknown, enabled: unknown) => void;

    passthroughHandler({}, true);
    expect(getMainWindow).not.toHaveBeenCalled();
  });

  it('no-ops overlay mutations when no main window is available', async () => {
    const getMainWindow = vi.fn(() => null);
    const settingsService = createSettingsServiceDouble();
    const { registerIpcHandlers } = await import('./registerIpcHandlers');

    registerIpcHandlers({
      getMainWindow,
      platform: 'linux',
      settingsService,
    });

    const regionsHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'overlay:setHitRegions',
    )?.[1] as (_event: unknown, regions: unknown) => void;

    expect(() => {
      regionsHandler({}, [{ x: 1, y: 2, width: 3, height: 4 }]);
    }).not.toThrow();
    expect(getMainWindow).toHaveBeenCalledTimes(1);

    mockHandle.mockReset();
    registerIpcHandlers({
      getMainWindow,
      platform: 'win32',
      settingsService,
    });

    const passthroughHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'overlay:setPointerPassthrough',
    )?.[1] as (_event: unknown, enabled: unknown) => void;

    expect(() => {
      passthroughHandler({}, true);
    }).not.toThrow();
    expect(getMainWindow).toHaveBeenCalledTimes(2);
  });
});
