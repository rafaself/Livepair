// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInvoke = vi.fn();
const mockExposeInMainWorld = vi.fn();
const mockOn = vi.fn();
const mockOff = vi.fn();

vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: mockInvoke,
    on: mockOn,
    off: mockOff,
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
      'startTextChatStream',
      'getSettings',
      'updateSettings',
      'setOverlayHitRegions',
      'setOverlayPointerPassthrough',
    ]);
    expect(exposedBridge).toEqual({
      overlayMode: expect.any(String),
      checkHealth: expect.any(Function),
      requestSessionToken: expect.any(Function),
      startTextChatStream: expect.any(Function),
      getSettings: expect.any(Function),
      updateSettings: expect.any(Function),
      setOverlayHitRegions: expect.any(Function),
      setOverlayPointerPassthrough: expect.any(Function),
    });
  });

  it('maps bridge methods to strict IPC channels', async () => {
    const { bridge } = await import('./preload');

    mockInvoke.mockResolvedValueOnce({ status: 'ok', timestamp: 'now' });
    await bridge.checkHealth();
    expect(mockInvoke).toHaveBeenCalledWith('health:check');

    mockInvoke.mockResolvedValueOnce({
      token: 't',
      expireTime: '2099-03-09T12:30:00.000Z',
      newSessionExpireTime: '2099-03-09T12:01:30.000Z',
    });
    await bridge.requestSessionToken({ sessionId: 'session-1' });
    expect(mockInvoke).toHaveBeenCalledWith('session:requestToken', {
      sessionId: 'session-1',
    });

    mockInvoke.mockResolvedValueOnce({ streamId: 'stream-1' });
    const onEvent = vi.fn();
    const streamHandle = await bridge.startTextChatStream(
      {
        messages: [{ role: 'user', content: 'Summarize the current screen' }],
      },
      onEvent,
    );
    expect(mockOn).toHaveBeenCalledWith('session:textChatEvent', expect.any(Function));
    expect(mockInvoke).toHaveBeenCalledWith('session:startTextChat', {
      messages: [{ role: 'user', content: 'Summarize the current screen' }],
    });

    const eventListener = mockOn.mock.calls.find(
      ([channel]) => channel === 'session:textChatEvent',
    )?.[1] as (_event: unknown, payload: unknown) => void;

    eventListener({}, { streamId: 'stream-2', event: { type: 'completed' } });
    expect(onEvent).not.toHaveBeenCalled();

    eventListener({}, { streamId: 'stream-1', event: { type: 'text-delta', text: 'Hi' } });
    expect(onEvent).toHaveBeenCalledWith({ type: 'text-delta', text: 'Hi' });

    await streamHandle.cancel();
    expect(mockInvoke).toHaveBeenCalledWith('session:cancelTextChat', {
      streamId: 'stream-1',
    });
    expect(mockOff).toHaveBeenCalledWith('session:textChatEvent', eventListener);

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

    mockInvoke.mockResolvedValueOnce(undefined);
    await bridge.setOverlayHitRegions([{ x: 0, y: 10, width: 100, height: 60 }]);
    expect(mockInvoke).toHaveBeenCalledWith('overlay:setHitRegions', [
      { x: 0, y: 10, width: 100, height: 60 },
    ]);

    mockInvoke.mockResolvedValueOnce(undefined);
    await bridge.setOverlayPointerPassthrough(false);
    expect(mockInvoke).toHaveBeenCalledWith('overlay:setPointerPassthrough', false);
  });

  it('delivers text chat events emitted before startTextChatStream resolves', async () => {
    const { bridge } = await import('./preload');

    let resolveStart:
      | ((value: { streamId: string }) => void)
      | undefined;
    mockInvoke.mockImplementationOnce(
      () =>
        new Promise<{ streamId: string }>((resolve) => {
          resolveStart = resolve;
        }),
    );

    const onEvent = vi.fn();
    const streamHandlePromise = bridge.startTextChatStream(
      {
        messages: [{ role: 'user', content: 'Hello' }],
      },
      onEvent,
    );

    expect(mockOn).toHaveBeenCalledWith('session:textChatEvent', expect.any(Function));
    const eventListener = mockOn.mock.calls.find(
      ([channel]) => channel === 'session:textChatEvent',
    )?.[1] as (_event: unknown, payload: unknown) => void;

    eventListener({}, { streamId: 'stream-early', event: { type: 'text-delta', text: 'Hi' } });
    expect(onEvent).not.toHaveBeenCalled();

    resolveStart?.({ streamId: 'stream-early' });
    const streamHandle = await streamHandlePromise;

    expect(onEvent).toHaveBeenCalledWith({ type: 'text-delta', text: 'Hi' });

    mockInvoke.mockResolvedValueOnce(undefined);
    await streamHandle.cancel();
    expect(mockOff).toHaveBeenCalledWith('session:textChatEvent', eventListener);
    expect(mockInvoke).toHaveBeenCalledWith('session:cancelTextChat', {
      streamId: 'stream-early',
    });
  });

  it('passes explicit empty payload when request has no fields', async () => {
    const { bridge } = await import('./preload');

    mockInvoke.mockResolvedValueOnce({
      token: 't',
      expireTime: '2099-03-09T12:30:00.000Z',
      newSessionExpireTime: '2099-03-09T12:01:30.000Z',
    });
    await bridge.requestSessionToken({});

    expect(mockInvoke).toHaveBeenCalledWith('session:requestToken', {});
  });

  it('exposes the platform-derived overlay mode', async () => {
    const { bridge } = await import('./preload');

    expect(['linux-shape', 'forwarded-pointer']).toContain(bridge.overlayMode);
  });
});
