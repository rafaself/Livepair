// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInvoke = vi.fn();
const mockOn = vi.fn();
const mockRemoveListener = vi.fn();
const mockExposeInMainWorld = vi.fn();

vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: mockInvoke,
    on: mockOn,
    removeListener: mockRemoveListener,
  },
  contextBridge: {
    exposeInMainWorld: mockExposeInMainWorld,
  },
}));

describe('preload bridge', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('exposes only the bridge API surface', async () => {
    await import('./preload');

    expect(mockExposeInMainWorld).toHaveBeenCalledTimes(1);
    const [, exposedBridge] = mockExposeInMainWorld.mock.calls[0] ?? [];

    expect(mockExposeInMainWorld).toHaveBeenCalledWith('bridge', exposedBridge);
    expect(Object.keys(exposedBridge)).toEqual([
      'overlayMode',
      'checkHealth',
      'requestSessionToken',
      'getSettings',
      'updateSettings',
      'listDisplays',
      'setOverlayHitRegions',
      'setOverlayPointerPassthrough',
      'setOverlayInteractive',
      'getOverlayWindowState',
      'onOverlayWindowState',
    ]);
    expect(exposedBridge).toEqual({
      overlayMode: expect.any(String),
      checkHealth: expect.any(Function),
      requestSessionToken: expect.any(Function),
      getSettings: expect.any(Function),
      updateSettings: expect.any(Function),
      listDisplays: expect.any(Function),
      setOverlayHitRegions: expect.any(Function),
      setOverlayPointerPassthrough: expect.any(Function),
      setOverlayInteractive: expect.any(Function),
      getOverlayWindowState: expect.any(Function),
      onOverlayWindowState: expect.any(Function),
    });
  });

  it('maps bridge methods to strict IPC channels', async () => {
    const { bridge } = await import('./preload');

    mockInvoke.mockResolvedValueOnce({ status: 'ok', timestamp: 'now' });
    await bridge.checkHealth();
    expect(mockInvoke).toHaveBeenCalledWith('health:check');

    mockInvoke.mockResolvedValueOnce({
      token: 't',
      expiresAt: 'later',
      isStub: true,
    });
    await bridge.requestSessionToken({ sessionId: 'session-1' });
    expect(mockInvoke).toHaveBeenCalledWith('session:requestToken', {
      sessionId: 'session-1',
    });

    mockInvoke.mockResolvedValueOnce({
      backendUrl: 'http://localhost:3000',
      isPanelPinned: false,
      preferredMode: 'fast',
      selectedInputDeviceId: 'default',
      selectedOutputDeviceId: 'default',
      themePreference: 'system',
    });
    await bridge.getSettings();
    expect(mockInvoke).toHaveBeenCalledWith('settings:get');

    mockInvoke.mockResolvedValueOnce({
      backendUrl: 'https://api.livepair.dev',
      isPanelPinned: false,
      preferredMode: 'fast',
      selectedInputDeviceId: 'default',
      selectedOutputDeviceId: 'default',
      themePreference: 'system',
    });
    await bridge.updateSettings({ backendUrl: 'https://api.livepair.dev' });
    expect(mockInvoke).toHaveBeenCalledWith('settings:update', {
      backendUrl: 'https://api.livepair.dev',
    });

    mockInvoke.mockResolvedValueOnce([
      { id: 'primary', label: 'Primary display', isPrimary: true },
    ]);
    await bridge.listDisplays();
    expect(mockInvoke).toHaveBeenCalledWith('displays:list');

    mockInvoke.mockResolvedValueOnce(undefined);
    await bridge.setOverlayHitRegions([{ x: 0, y: 10, width: 100, height: 60 }]);
    expect(mockInvoke).toHaveBeenCalledWith('overlay:setHitRegions', [
      { x: 0, y: 10, width: 100, height: 60 },
    ]);

    mockInvoke.mockResolvedValueOnce(undefined);
    await bridge.setOverlayPointerPassthrough(false);
    expect(mockInvoke).toHaveBeenCalledWith('overlay:setPointerPassthrough', false);

    mockInvoke.mockResolvedValueOnce(undefined);
    await bridge.setOverlayInteractive(false);
    expect(mockInvoke).toHaveBeenCalledWith('overlay:setInteractive', false);

    mockInvoke.mockResolvedValueOnce({
      isFocused: false,
      isVisible: true,
      isInteractive: false,
    });
    await bridge.getOverlayWindowState();
    expect(mockInvoke).toHaveBeenCalledWith('overlay:getWindowState');
  });

  it('passes explicit empty payload when request has no fields', async () => {
    const { bridge } = await import('./preload');

    mockInvoke.mockResolvedValueOnce({ token: 't', expiresAt: 'later', isStub: true });
    await bridge.requestSessionToken({});

    expect(mockInvoke).toHaveBeenCalledWith('session:requestToken', {});
  });

  it('exposes the platform-derived overlay mode', async () => {
    const { bridge } = await import('./preload');

    expect(['linux-shape', 'forwarded-pointer']).toContain(bridge.overlayMode);
  });

  it('subscribes to overlay window state updates without leaking the ipc event', async () => {
    const { bridge } = await import('./preload');
    const listener = vi.fn();

    const unsubscribe = bridge.onOverlayWindowState(listener);

    expect(mockOn).toHaveBeenCalledWith(
      'overlay:windowStateChanged',
      expect.any(Function),
    );

    const subscription = mockOn.mock.calls[0]?.[1] as
      | ((_event: unknown, state: unknown) => void)
      | undefined;

    subscription?.({}, {
      isFocused: true,
      isVisible: true,
      isInteractive: true,
    });

    expect(listener).toHaveBeenCalledWith({
      isFocused: true,
      isVisible: true,
      isInteractive: true,
    });

    unsubscribe();

    expect(mockRemoveListener).toHaveBeenCalledWith(
      'overlay:windowStateChanged',
      subscription,
    );
  });
});
