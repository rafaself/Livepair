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
      'quitApp',
      'checkHealth',
      'requestSessionToken',
      'createChat',
      'getChat',
      'getOrCreateCurrentChat',
      'listChats',
      'listChatMessages',
      'getChatSummary',
      'appendChatMessage',
      'createLiveSession',
      'listLiveSessions',
      'updateLiveSession',
      'endLiveSession',
      'getSettings',
      'updateSettings',
      'setOverlayHitRegions',
      'setOverlayPointerPassthrough',
      'getScreenCaptureAccessStatus',
      'listScreenCaptureSources',
      'selectScreenCaptureSource',
      'startScreenFrameDumpSession',
      'saveScreenFrameDumpFrame',
    ]);
    expect(exposedBridge).toEqual({
      overlayMode: expect.any(String),
      quitApp: expect.any(Function),
      checkHealth: expect.any(Function),
      requestSessionToken: expect.any(Function),
      createChat: expect.any(Function),
      getChat: expect.any(Function),
      getOrCreateCurrentChat: expect.any(Function),
      listChats: expect.any(Function),
      listChatMessages: expect.any(Function),
      getChatSummary: expect.any(Function),
      appendChatMessage: expect.any(Function),
      createLiveSession: expect.any(Function),
      listLiveSessions: expect.any(Function),
      updateLiveSession: expect.any(Function),
      endLiveSession: expect.any(Function),
      getSettings: expect.any(Function),
      updateSettings: expect.any(Function),
      setOverlayHitRegions: expect.any(Function),
      setOverlayPointerPassthrough: expect.any(Function),
      getScreenCaptureAccessStatus: expect.any(Function),
      listScreenCaptureSources: expect.any(Function),
      selectScreenCaptureSource: expect.any(Function),
      startScreenFrameDumpSession: expect.any(Function),
      saveScreenFrameDumpFrame: expect.any(Function),
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
        id: 'chat-1',
        title: null,
        createdAt: '2026-03-12T00:00:00.000Z',
        updatedAt: '2026-03-12T00:00:00.000Z',
        isCurrent: true,
      },
    ]);
    await bridge.listChats();
    expect(mockInvoke).toHaveBeenCalledWith('chatMemory:listChats');

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
      chatId: 'chat-1',
      schemaVersion: 1,
      source: 'local-recent-history-v1',
      summaryText: 'Compact continuity summary',
      coveredThroughSequence: 3,
      updatedAt: '2026-03-12T00:05:00.000Z',
    });
    await bridge.getChatSummary('chat-1');
    expect(mockInvoke).toHaveBeenCalledWith('chatMemory:getSummary', 'chat-1');

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
      resumptionHandle: null,
      lastResumptionUpdateAt: null,
      restorable: false,
      invalidatedAt: null,
      invalidationReason: null,
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
        resumptionHandle: null,
        lastResumptionUpdateAt: null,
        restorable: false,
        invalidatedAt: null,
        invalidationReason: null,
      },
    ]);
    await bridge.listLiveSessions('chat-1');
    expect(mockInvoke).toHaveBeenCalledWith('liveSession:listByChat', 'chat-1');

    mockInvoke.mockResolvedValueOnce({
      id: 'live-session-1',
      chatId: 'chat-1',
      startedAt: '2026-03-12T00:00:00.000Z',
      endedAt: null,
      status: 'active',
      endedReason: null,
      resumptionHandle: 'handles/live-session-1',
      lastResumptionUpdateAt: '2026-03-12T00:01:00.000Z',
      restorable: true,
      invalidatedAt: null,
      invalidationReason: null,
    });
    await bridge.updateLiveSession({
      kind: 'resumption',
      id: 'live-session-1',
      resumptionHandle: 'handles/live-session-1',
      lastResumptionUpdateAt: '2026-03-12T00:01:00.000Z',
      restorable: true,
      invalidatedAt: null,
      invalidationReason: null,
    });
    expect(mockInvoke).toHaveBeenCalledWith('liveSession:update', {
      kind: 'resumption',
      id: 'live-session-1',
      resumptionHandle: 'handles/live-session-1',
      lastResumptionUpdateAt: '2026-03-12T00:01:00.000Z',
      restorable: true,
      invalidatedAt: null,
      invalidationReason: null,
    });

    mockInvoke.mockResolvedValueOnce({
      id: 'live-session-1',
      chatId: 'chat-1',
      startedAt: '2026-03-12T00:00:00.000Z',
      endedAt: '2026-03-12T00:05:00.000Z',
      status: 'ended',
      endedReason: 'user-ended',
      resumptionHandle: null,
      lastResumptionUpdateAt: null,
      restorable: false,
      invalidatedAt: null,
      invalidationReason: null,
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

    mockInvoke.mockResolvedValueOnce({
      platform: 'darwin',
      permissionStatus: 'granted',
    });
    await bridge.getScreenCaptureAccessStatus();
    expect(mockInvoke).toHaveBeenCalledWith('screenCapture:getAccessStatus');

    mockInvoke.mockResolvedValueOnce({
      sources: [
        { id: 'screen:1:0', name: 'Entire Screen', kind: 'screen', displayId: '1' },
      ],
      selectedSourceId: null,
      overlayDisplay: {
        displayId: '1',
        bounds: { x: 0, y: 0, width: 2560, height: 1440 },
        workArea: { x: 0, y: 23, width: 2560, height: 1417 },
        scaleFactor: 2,
      },
    });
    await expect(bridge.listScreenCaptureSources()).resolves.toEqual({
      sources: [
        { id: 'screen:1:0', name: 'Entire Screen', kind: 'screen', displayId: '1' },
      ],
      selectedSourceId: null,
      overlayDisplay: {
        displayId: '1',
        bounds: { x: 0, y: 0, width: 2560, height: 1440 },
        workArea: { x: 0, y: 23, width: 2560, height: 1417 },
        scaleFactor: 2,
      },
    });
    expect(mockInvoke).toHaveBeenCalledWith('screenCapture:listSources');

    mockInvoke.mockResolvedValueOnce({
      sources: [{ id: 'window:42:0', name: 'VSCode', kind: 'window' }],
      selectedSourceId: 'window:42:0',
      overlayDisplay: {
        displayId: '1',
        bounds: { x: 0, y: 0, width: 2560, height: 1440 },
        workArea: { x: 0, y: 23, width: 2560, height: 1417 },
        scaleFactor: 2,
      },
    });
    await expect(bridge.selectScreenCaptureSource('window:42:0')).resolves.toEqual({
      sources: [{ id: 'window:42:0', name: 'VSCode', kind: 'window' }],
      selectedSourceId: 'window:42:0',
      overlayDisplay: {
        displayId: '1',
        bounds: { x: 0, y: 0, width: 2560, height: 1440 },
        workArea: { x: 0, y: 23, width: 2560, height: 1417 },
        scaleFactor: 2,
      },
    });
    expect(mockInvoke).toHaveBeenCalledWith(
      'screenCapture:selectSource',
      'window:42:0',
    );

    mockInvoke.mockResolvedValueOnce({
      directoryPath: '/tmp/livepair/screen-frame-dumps/current-debug-session',
    });
    await bridge.startScreenFrameDumpSession();
    expect(mockInvoke).toHaveBeenCalledWith('screenFrameDump:startSession');

    mockInvoke.mockResolvedValueOnce(undefined);
    await bridge.saveScreenFrameDumpFrame({
      sequence: 3,
      mimeType: 'image/jpeg',
      data: new Uint8Array([7, 8, 9]),
    });
    expect(mockInvoke).toHaveBeenCalledWith('screenFrameDump:saveFrame', {
      sequence: 3,
      mimeType: 'image/jpeg',
      data: new Uint8Array([7, 8, 9]),
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
