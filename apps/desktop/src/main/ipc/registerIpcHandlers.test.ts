// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import type {
  AppendChatMessageRequest,
  ChatMessageRecord,
  ChatRecord,
  DurableChatSummaryRecord,
  LiveSessionRecord,
} from '@livepair/shared-types';
import type { DesktopSettings } from '../../shared/settings';
import type { ChatMemoryService } from '../chatMemory/chatMemoryService';
import type { DesktopSettingsService } from '../settings/settingsService';

const mockHandle = vi.fn();
const mockGetSources = vi.fn();
const mockQuit = vi.fn();
const mockGetMediaAccessStatus = vi.fn();

vi.mock('electron', () => ({
  app: { quit: mockQuit },
  desktopCapturer: { getSources: mockGetSources },
  ipcMain: { handle: mockHandle },
  systemPreferences: { getMediaAccessStatus: mockGetMediaAccessStatus },
}));

const defaultSettings: DesktopSettings = {
  themePreference: 'system',
  backendUrl: 'http://localhost:3000',
  preferredMode: 'fast',
  selectedInputDeviceId: 'default',
  selectedOutputDeviceId: 'default',
  voiceEchoCancellationEnabled: true,
  voiceNoiseSuppressionEnabled: true,
  voiceAutoGainControlEnabled: true,
  speechSilenceTimeout: 'never',
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

function createChatRecord(overrides: Partial<ChatRecord> = {}): ChatRecord {
  return {
    id: 'chat-1',
    title: null,
    createdAt: '2026-03-12T00:00:00.000Z',
    updatedAt: '2026-03-12T00:00:00.000Z',
    isCurrent: true,
    ...overrides,
  };
}

function createChatMessageRecord(
  overrides: Partial<ChatMessageRecord> = {},
): ChatMessageRecord {
  return {
    id: 'message-1',
    chatId: 'chat-1',
    role: 'user',
    contentText: 'Hello',
    createdAt: '2026-03-12T00:00:00.000Z',
    sequence: 1,
    ...overrides,
  };
}

function createLiveSessionRecord(
  overrides: Partial<LiveSessionRecord> = {},
): LiveSessionRecord {
  return {
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
    ...overrides,
  };
}

function createChatSummaryRecord(
  overrides: Partial<DurableChatSummaryRecord> = {},
): DurableChatSummaryRecord {
  return {
    chatId: 'chat-1',
    schemaVersion: 1,
    source: 'local-recent-history-v1',
    summaryText: 'Compact continuity summary',
    coveredThroughSequence: 3,
    updatedAt: '2026-03-12T00:05:00.000Z',
    ...overrides,
  };
}

function createChatMemoryServiceDouble(): ChatMemoryService {
  return {
    createChat: vi.fn(() => createChatRecord()),
    getChat: vi.fn(() => createChatRecord()),
    getOrCreateCurrentChat: vi.fn(() => createChatRecord()),
    listChats: vi.fn(() => [createChatRecord()]),
    listMessages: vi.fn(() => [createChatMessageRecord()]),
    getChatSummary: vi.fn(() => createChatSummaryRecord()),
    appendMessage: vi.fn((request: AppendChatMessageRequest) =>
      createChatMessageRecord(request),
    ),
    createLiveSession: vi.fn(() => createLiveSessionRecord()),
    listLiveSessions: vi.fn(() => [createLiveSessionRecord()]),
    updateLiveSession: vi.fn(() => createLiveSessionRecord({ restorable: true })),
    endLiveSession: vi.fn(() => createLiveSessionRecord({ status: 'ended' })),
  } as unknown as ChatMemoryService;
}

function createScreenFrameDumpServiceDouble(): {
  startSession: ReturnType<typeof vi.fn>;
  saveFrame: ReturnType<typeof vi.fn>;
} {
  return {
    startSession: vi.fn(async () => ({
      directoryPath: '/tmp/livepair/screen-frame-dumps/current-debug-session',
    })),
    saveFrame: vi.fn(async () => undefined),
  };
}

describe('registerIpcHandlers', () => {
  beforeEach(() => {
    vi.resetModules();
    mockHandle.mockReset();
    mockGetSources.mockReset();
    mockGetMediaAccessStatus.mockReset();
  });

  it('registers the expected IPC channels', async () => {
    const { registerIpcHandlers } = await import('./registerIpcHandlers');

    registerIpcHandlers({
      chatMemoryService: createChatMemoryServiceDouble(),
      getMainWindow: () => null,
      screenFrameDumpService: createScreenFrameDumpServiceDouble(),
      settingsService: createSettingsServiceDouble(),
    });

    expect(mockHandle).toHaveBeenCalledTimes(23);
    expect(mockHandle).toHaveBeenNthCalledWith(1, 'app:quit', expect.any(Function));
    expect(mockHandle).toHaveBeenNthCalledWith(2, 'health:check', expect.any(Function));
    expect(mockHandle).toHaveBeenNthCalledWith(
      3,
      'session:requestToken',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      4,
      'chatMemory:createChat',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      5,
      'chatMemory:getChat',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      6,
      'chatMemory:getOrCreateCurrentChat',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      7,
      'chatMemory:listChats',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      8,
      'chatMemory:listMessages',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      9,
      'chatMemory:getSummary',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      10,
      'chatMemory:appendMessage',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      11,
      'liveSession:create',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      12,
      'liveSession:listByChat',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      13,
      'liveSession:update',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      14,
      'liveSession:end',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      15,
      'settings:get',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      16,
      'settings:update',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      17,
      'overlay:setHitRegions',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      18,
      'overlay:setPointerPassthrough',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      19,
      'screenCapture:getAccessStatus',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      20,
      'screenCapture:listSources',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      21,
      'screenCapture:selectSource',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      22,
      'screenFrameDump:startSession',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      23,
      'screenFrameDump:saveFrame',
      expect.any(Function),
    );
  });

  it('validates token request payloads before delegating to the backend client', async () => {
    const fetchImpl = vi.fn();
    const settingsService = createSettingsServiceDouble();
    const { registerIpcHandlers } = await import('./registerIpcHandlers');

    registerIpcHandlers({
      chatMemoryService: createChatMemoryServiceDouble(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getMainWindow: () => null,
      screenFrameDumpService: createScreenFrameDumpServiceDouble(),
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
        json: vi.fn(async () => ({
          token: 'ephemeral-token',
          expireTime: '2099-03-09T12:30:00.000Z',
          newSessionExpireTime: '2099-03-09T12:01:30.000Z',
        })),
      });
    const settingsService = createSettingsServiceDouble();
    vi.mocked(settingsService.updateSettings).mockResolvedValue({
      ...defaultSettings,
      backendUrl: 'https://api.livepair.dev',
    });
    const { registerIpcHandlers } = await import('./registerIpcHandlers');

    registerIpcHandlers({
      chatMemoryService: createChatMemoryServiceDouble(),
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
      token: 'ephemeral-token',
      expireTime: '2099-03-09T12:30:00.000Z',
      newSessionExpireTime: '2099-03-09T12:01:30.000Z',
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

  it('validates and delegates chat memory handlers through the chat memory service', async () => {
    const chatMemoryService = createChatMemoryServiceDouble();
    const settingsService = createSettingsServiceDouble();
    const { registerIpcHandlers } = await import('./registerIpcHandlers');

    registerIpcHandlers({
      chatMemoryService,
      getMainWindow: () => null,
      screenFrameDumpService: createScreenFrameDumpServiceDouble(),
      settingsService,
    });

    const createChatHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'chatMemory:createChat',
    )?.[1] as (_event: unknown, req: unknown) => Promise<ChatRecord>;
    const getChatHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'chatMemory:getChat',
    )?.[1] as (_event: unknown, chatId: unknown) => Promise<ChatRecord | null>;
    const getOrCreateCurrentChatHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'chatMemory:getOrCreateCurrentChat',
    )?.[1] as () => Promise<ChatRecord>;
    const listMessagesHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'chatMemory:listMessages',
    )?.[1] as (_event: unknown, chatId: unknown) => Promise<ChatMessageRecord[]>;
    const getChatSummaryHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'chatMemory:getSummary',
    )?.[1] as (_event: unknown, chatId: unknown) => Promise<DurableChatSummaryRecord | null>;
    const appendMessageHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'chatMemory:appendMessage',
    )?.[1] as (_event: unknown, req: unknown) => Promise<ChatMessageRecord>;
    const createLiveSessionHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'liveSession:create',
    )?.[1] as (_event: unknown, req: unknown) => Promise<LiveSessionRecord>;
    const listLiveSessionsHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'liveSession:listByChat',
    )?.[1] as (_event: unknown, chatId: unknown) => Promise<LiveSessionRecord[]>;
    const updateLiveSessionHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'liveSession:update',
    )?.[1] as (_event: unknown, req: unknown) => Promise<LiveSessionRecord>;
    const endLiveSessionHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'liveSession:end',
    )?.[1] as (_event: unknown, req: unknown) => Promise<LiveSessionRecord>;

    await expect(createChatHandler({}, { title: 5 })).rejects.toThrow(
      'Invalid create chat payload',
    );
    await expect(getChatHandler({}, '')).rejects.toThrow('Invalid chat id');
    await expect(listMessagesHandler({}, '')).rejects.toThrow('Invalid chat id');
    await expect(getChatSummaryHandler({}, '')).rejects.toThrow('Invalid chat id');
    await expect(
      appendMessageHandler({}, { chatId: 'chat-1', role: 'system', contentText: 'bad' }),
    ).rejects.toThrow('Invalid append chat message payload');
    await expect(createLiveSessionHandler({}, { chatId: '' })).rejects.toThrow(
      'Invalid create live session payload',
    );
    await expect(listLiveSessionsHandler({}, '')).rejects.toThrow('Invalid chat id');
    await expect(updateLiveSessionHandler({}, { kind: 'resumption', id: '', restorable: true })).rejects.toThrow(
      'Invalid update live session payload',
    );
    await expect(endLiveSessionHandler({}, { id: '', status: 'ended' })).rejects.toThrow(
      'Invalid end live session payload',
    );

    await expect(createChatHandler({}, { title: 'New chat' })).resolves.toEqual(
      createChatRecord(),
    );
    await expect(getChatHandler({}, 'chat-1')).resolves.toEqual(createChatRecord());
    await expect(getOrCreateCurrentChatHandler()).resolves.toEqual(createChatRecord());
    await expect(listMessagesHandler({}, 'chat-1')).resolves.toEqual([
      createChatMessageRecord(),
    ]);
    await expect(getChatSummaryHandler({}, 'chat-1')).resolves.toEqual(createChatSummaryRecord());
    await expect(
      appendMessageHandler({}, { chatId: 'chat-1', role: 'assistant', contentText: 'Stored' }),
    ).resolves.toEqual(
      createChatMessageRecord({
        role: 'assistant',
        contentText: 'Stored',
      }),
    );
    await expect(createLiveSessionHandler({}, { chatId: 'chat-1' })).resolves.toEqual(
      createLiveSessionRecord(),
    );
    await expect(listLiveSessionsHandler({}, 'chat-1')).resolves.toEqual([
      createLiveSessionRecord(),
    ]);
    await expect(
      updateLiveSessionHandler({}, {
        kind: 'resumption',
        id: 'live-session-1',
        resumptionHandle: 'handles/live-session-1',
        lastResumptionUpdateAt: '2026-03-12T00:01:00.000Z',
        restorable: true,
        invalidatedAt: null,
        invalidationReason: null,
      }),
    ).resolves.toEqual(createLiveSessionRecord({ restorable: true }));
    await expect(
      endLiveSessionHandler({}, { id: 'live-session-1', status: 'ended' }),
    ).resolves.toEqual(createLiveSessionRecord({ status: 'ended' }));

    expect(chatMemoryService.createChat).toHaveBeenCalledWith({ title: 'New chat' });
    expect(chatMemoryService.getChat).toHaveBeenCalledWith('chat-1');
    expect(chatMemoryService.getOrCreateCurrentChat).toHaveBeenCalledTimes(1);
    expect(chatMemoryService.listMessages).toHaveBeenCalledWith('chat-1');
    expect(chatMemoryService.getChatSummary).toHaveBeenCalledWith('chat-1');
    expect(chatMemoryService.appendMessage).toHaveBeenCalledWith({
      chatId: 'chat-1',
      role: 'assistant',
      contentText: 'Stored',
    });
    expect(chatMemoryService.createLiveSession).toHaveBeenCalledWith({ chatId: 'chat-1' });
    expect(chatMemoryService.listLiveSessions).toHaveBeenCalledWith('chat-1');
    expect(chatMemoryService.updateLiveSession).toHaveBeenCalledWith({
      kind: 'resumption',
      id: 'live-session-1',
      resumptionHandle: 'handles/live-session-1',
      lastResumptionUpdateAt: '2026-03-12T00:01:00.000Z',
      restorable: true,
      invalidatedAt: null,
      invalidationReason: null,
    });
    expect(chatMemoryService.endLiveSession).toHaveBeenCalledWith({
      id: 'live-session-1',
      status: 'ended',
    });
  });

  it('validates and delegates screen frame dump handlers', async () => {
    const settingsService = createSettingsServiceDouble();
    const screenFrameDumpService = createScreenFrameDumpServiceDouble();
    const { registerIpcHandlers } = await import('./registerIpcHandlers');

    registerIpcHandlers({
      chatMemoryService: createChatMemoryServiceDouble(),
      getMainWindow: () => null,
      screenFrameDumpService,
      settingsService,
    });

    const startSessionHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'screenFrameDump:startSession',
    )?.[1] as () => Promise<{ directoryPath: string }>;
    const saveFrameHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'screenFrameDump:saveFrame',
    )?.[1] as (_event: unknown, payload: unknown) => Promise<void>;

    await expect(startSessionHandler()).resolves.toEqual({
      directoryPath: '/tmp/livepair/screen-frame-dumps/current-debug-session',
    });
    await expect(
      saveFrameHandler({}, {
        sequence: 0,
        mimeType: 'image/jpeg',
        data: new Uint8Array([1, 2, 3]),
      }),
    ).rejects.toThrow('Invalid screen frame dump payload');
    await expect(
      saveFrameHandler({}, {
        sequence: 2,
        mimeType: 'image/jpeg',
        data: new Uint8Array([4, 5, 6]),
      }),
    ).resolves.toBeUndefined();

    expect(screenFrameDumpService.startSession).toHaveBeenCalledTimes(1);
    expect(screenFrameDumpService.saveFrame).toHaveBeenCalledWith({
      sequence: 2,
      mimeType: 'image/jpeg',
      data: new Uint8Array([4, 5, 6]),
    });
  });

  it('rejects invalid settings updates before touching the settings service', async () => {
    const settingsService = createSettingsServiceDouble();
    const { registerIpcHandlers } = await import('./registerIpcHandlers');

    registerIpcHandlers({
      chatMemoryService: createChatMemoryServiceDouble(),
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

  it('lists capture sources and stores the selected source through screen capture handlers', async () => {
    mockGetSources.mockResolvedValue([
      {
        id: 'screen:1:0',
        name: 'Entire Screen',
      },
      {
        id: 'window:42:0',
        name: 'VSCode',
      },
    ]);
    const settingsService = createSettingsServiceDouble();
    const { registerIpcHandlers } = await import('./registerIpcHandlers');

    registerIpcHandlers({
      chatMemoryService: createChatMemoryServiceDouble(),
      getMainWindow: () => null,
      settingsService,
    });

    const listSourcesHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'screenCapture:listSources',
    )?.[1] as () => Promise<unknown>;
    const selectSourceHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'screenCapture:selectSource',
    )?.[1] as (_event: unknown, sourceId: unknown) => Promise<unknown>;

    await expect(listSourcesHandler()).resolves.toEqual({
      sources: [
        { id: 'screen:1:0', name: 'Entire Screen' },
        { id: 'window:42:0', name: 'VSCode' },
      ],
      selectedSourceId: null,
    });

    await expect(selectSourceHandler({}, 'window:42:0')).resolves.toEqual({
      sources: [
        { id: 'screen:1:0', name: 'Entire Screen' },
        { id: 'window:42:0', name: 'VSCode' },
      ],
      selectedSourceId: 'window:42:0',
    });

    expect(mockGetSources).toHaveBeenNthCalledWith(1, {
      types: ['screen', 'window'],
      thumbnailSize: { width: 0, height: 0 },
    });
    expect(mockGetSources).toHaveBeenNthCalledWith(2, {
      types: ['screen', 'window'],
      thumbnailSize: { width: 0, height: 0 },
    });
  });

  it('reports screen capture access status through IPC', async () => {
    mockGetMediaAccessStatus.mockReturnValueOnce('granted');
    const settingsService = createSettingsServiceDouble();
    const { registerIpcHandlers } = await import('./registerIpcHandlers');

    registerIpcHandlers({
      chatMemoryService: createChatMemoryServiceDouble(),
      getMainWindow: () => null,
      platform: 'darwin',
      settingsService,
    });

    const accessStatusHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'screenCapture:getAccessStatus',
    )?.[1] as () => Promise<unknown>;

    await expect(accessStatusHandler()).resolves.toEqual({
      platform: 'darwin',
      permissionStatus: 'granted',
    });
  });

  it('rejects invalid screen capture source selections before storing them', async () => {
    mockGetSources.mockResolvedValue([
      {
        id: 'screen:1:0',
        name: 'Entire Screen',
      },
    ]);
    const settingsService = createSettingsServiceDouble();
    const { registerIpcHandlers } = await import('./registerIpcHandlers');

    registerIpcHandlers({
      chatMemoryService: createChatMemoryServiceDouble(),
      getMainWindow: () => null,
      settingsService,
    });

    const selectSourceHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'screenCapture:selectSource',
    )?.[1] as (_event: unknown, sourceId: unknown) => Promise<unknown>;

    await expect(selectSourceHandler({}, 42)).rejects.toThrow(
      'screenCapture:selectSource requires a string or null',
    );
    await expect(selectSourceHandler({}, 'window:missing:0')).rejects.toThrow(
      'Unknown screen capture source id',
    );
  });

  it('routes overlay operations through the current window with platform-aware behavior', async () => {
    const mainWindow = createMainWindowDouble();
    const setShape = vi.mocked(mainWindow.setShape);
    const setIgnoreMouseEvents = vi.mocked(mainWindow.setIgnoreMouseEvents);
    const getMainWindow = vi.fn(() => mainWindow);
    const settingsService = createSettingsServiceDouble();
    const { registerIpcHandlers } = await import('./registerIpcHandlers');

    registerIpcHandlers({
      chatMemoryService: createChatMemoryServiceDouble(),
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
      chatMemoryService: createChatMemoryServiceDouble(),
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
      chatMemoryService: createChatMemoryServiceDouble(),
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
      chatMemoryService: createChatMemoryServiceDouble(),
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
      chatMemoryService: createChatMemoryServiceDouble(),
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
      chatMemoryService: createChatMemoryServiceDouble(),
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
