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
});
