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
      'createChat',
      'getChat',
      'getOrCreateCurrentChat',
      'listChatMessages',
      'appendChatMessage',
      'createLiveSession',
      'listLiveSessions',
      'endLiveSession',
      'getSettings',
      'updateSettings',
      'setOverlayHitRegions',
      'setOverlayPointerPassthrough',
    ]);
    expect(exposedBridge).toEqual({
      overlayMode: expect.any(String),
      checkHealth: expect.any(Function),
      requestSessionToken: expect.any(Function),
      createChat: expect.any(Function),
      getChat: expect.any(Function),
      getOrCreateCurrentChat: expect.any(Function),
      listChatMessages: expect.any(Function),
      appendChatMessage: expect.any(Function),
      createLiveSession: expect.any(Function),
      listLiveSessions: expect.any(Function),
      endLiveSession: expect.any(Function),
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

    mockInvoke.mockResolvedValueOnce({
      id: 'chat-1',
      title: null,
      createdAt: '2026-03-12T00:00:00.000Z',
      updatedAt: '2026-03-12T00:00:00.000Z',
      isCurrent: true,
    });
    await bridge.createChat();
    expect(mockInvoke).toHaveBeenCalledWith('chatMemory:createChat', undefined);

    mockInvoke.mockResolvedValueOnce({
      id: 'chat-1',
      title: null,
      createdAt: '2026-03-12T00:00:00.000Z',
      updatedAt: '2026-03-12T00:00:00.000Z',
      isCurrent: true,
    });
    await bridge.getChat('chat-1');
    expect(mockInvoke).toHaveBeenCalledWith('chatMemory:getChat', 'chat-1');

    mockInvoke.mockResolvedValueOnce({
      id: 'chat-1',
      title: null,
      createdAt: '2026-03-12T00:00:00.000Z',
      updatedAt: '2026-03-12T00:00:00.000Z',
      isCurrent: true,
    });
    await bridge.getOrCreateCurrentChat();
    expect(mockInvoke).toHaveBeenCalledWith('chatMemory:getOrCreateCurrentChat');

    mockInvoke.mockResolvedValueOnce([
      {
        id: 'message-1',
        chatId: 'chat-1',
        role: 'user',
        contentText: 'Hello',
        createdAt: '2026-03-12T00:00:00.000Z',
        sequence: 1,
      },
    ]);
    await bridge.listChatMessages('chat-1');
    expect(mockInvoke).toHaveBeenCalledWith('chatMemory:listMessages', 'chat-1');

    mockInvoke.mockResolvedValueOnce({
      id: 'message-1',
      chatId: 'chat-1',
      role: 'user',
      contentText: 'Hello',
      createdAt: '2026-03-12T00:00:00.000Z',
      sequence: 1,
    });
    await bridge.appendChatMessage({
      chatId: 'chat-1',
      role: 'user',
      contentText: 'Hello',
    });
    expect(mockInvoke).toHaveBeenCalledWith('chatMemory:appendMessage', {
      chatId: 'chat-1',
      role: 'user',
      contentText: 'Hello',
    });

    mockInvoke.mockResolvedValueOnce({
      id: 'live-session-1',
      chatId: 'chat-1',
      startedAt: '2026-03-12T00:00:00.000Z',
      endedAt: null,
      status: 'active',
      endedReason: null,
      latestResumeHandle: null,
      resumable: false,
    });
    await bridge.createLiveSession({ chatId: 'chat-1' });
    expect(mockInvoke).toHaveBeenCalledWith('liveSession:create', { chatId: 'chat-1' });

    mockInvoke.mockResolvedValueOnce([
      {
        id: 'live-session-1',
        chatId: 'chat-1',
        startedAt: '2026-03-12T00:00:00.000Z',
        endedAt: null,
        status: 'active',
        endedReason: null,
        latestResumeHandle: null,
        resumable: false,
      },
    ]);
    await bridge.listLiveSessions('chat-1');
    expect(mockInvoke).toHaveBeenCalledWith('liveSession:listByChat', 'chat-1');

    mockInvoke.mockResolvedValueOnce({
      id: 'live-session-1',
      chatId: 'chat-1',
      startedAt: '2026-03-12T00:00:00.000Z',
      endedAt: '2026-03-12T00:05:00.000Z',
      status: 'ended',
      endedReason: 'user-ended',
      latestResumeHandle: null,
      resumable: false,
    });
    await bridge.endLiveSession({
      id: 'live-session-1',
      status: 'ended',
      endedReason: 'user-ended',
    });
    expect(mockInvoke).toHaveBeenCalledWith('liveSession:end', {
      id: 'live-session-1',
      status: 'ended',
      endedReason: 'user-ended',
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

    mockInvoke.mockResolvedValueOnce(undefined);
    await bridge.setOverlayHitRegions([{ x: 0, y: 10, width: 100, height: 60 }]);
    expect(mockInvoke).toHaveBeenCalledWith('overlay:setHitRegions', [
      { x: 0, y: 10, width: 100, height: 60 },
    ]);

    mockInvoke.mockResolvedValueOnce(undefined);
    await bridge.setOverlayPointerPassthrough(false);
    expect(mockInvoke).toHaveBeenCalledWith('overlay:setPointerPassthrough', false);
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
