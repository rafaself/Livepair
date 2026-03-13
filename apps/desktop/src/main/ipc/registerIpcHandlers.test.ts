// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import type {
  AppendChatMessageRequest,
  ChatMessageRecord,
  ChatRecord,
} from '@livepair/shared-types';
import type { DesktopSettings } from '../../shared/settings';
import type { ChatMemoryService } from '../chatMemory/chatMemoryService';
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

function createChatMemoryServiceDouble(): ChatMemoryService {
  return {
    createChat: vi.fn(() => createChatRecord()),
    getChat: vi.fn(() => createChatRecord()),
    getOrCreateCurrentChat: vi.fn(() => createChatRecord()),
    listMessages: vi.fn(() => [createChatMessageRecord()]),
    appendMessage: vi.fn((request: AppendChatMessageRequest) =>
      createChatMessageRecord(request),
    ),
  } as unknown as ChatMemoryService;
}

describe('registerIpcHandlers', () => {
  beforeEach(() => {
    vi.resetModules();
    mockHandle.mockReset();
  });

  it('registers the expected IPC channels', async () => {
    const { registerIpcHandlers } = await import('./registerIpcHandlers');

    registerIpcHandlers({
      chatMemoryService: createChatMemoryServiceDouble(),
      getMainWindow: () => null,
      settingsService: createSettingsServiceDouble(),
    });

    expect(mockHandle).toHaveBeenCalledTimes(13);
    expect(mockHandle).toHaveBeenNthCalledWith(1, 'health:check', expect.any(Function));
    expect(mockHandle).toHaveBeenNthCalledWith(
      2,
      'session:requestToken',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      3,
      'session:startTextChat',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      4,
      'session:cancelTextChat',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      5,
      'chatMemory:createChat',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      6,
      'chatMemory:getChat',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      7,
      'chatMemory:getOrCreateCurrentChat',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      8,
      'chatMemory:listMessages',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      9,
      'chatMemory:appendMessage',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(10, 'settings:get', expect.any(Function));
    expect(mockHandle).toHaveBeenNthCalledWith(
      11,
      'settings:update',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      12,
      'overlay:setHitRegions',
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      13,
      'overlay:setPointerPassthrough',
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

  it('validates text chat payloads before delegating to the backend client', async () => {
    const fetchImpl = vi.fn();
    const settingsService = createSettingsServiceDouble();
    const { registerIpcHandlers } = await import('./registerIpcHandlers');

    registerIpcHandlers({
      chatMemoryService: createChatMemoryServiceDouble(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getMainWindow: () => null,
      settingsService,
    });

    const startTextChatHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'session:startTextChat',
    )?.[1] as (_event: unknown, req: unknown) => Promise<unknown>;
    const cancelTextChatHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'session:cancelTextChat',
    )?.[1] as (_event: unknown, req: unknown) => Promise<unknown>;

    await expect(startTextChatHandler({}, { messages: [] })).rejects.toThrow(
      'Invalid text chat request payload',
    );
    await expect(cancelTextChatHandler({}, { streamId: '' })).rejects.toThrow(
      'Invalid text chat cancel payload',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('streams backend text chat events through the IPC sender and supports cancellation', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              [
                '{"type":"text-delta","text":"Here is "}',
                '{"type":"completed"}',
              ].join('\n'),
            ),
          );
          controller.close();
        },
      }),
    });
    const sender = {
      send: vi.fn(),
    };
    const settingsService = createSettingsServiceDouble();
    const { registerIpcHandlers } = await import('./registerIpcHandlers');

    registerIpcHandlers({
      chatMemoryService: createChatMemoryServiceDouble(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getMainWindow: () => null,
      settingsService,
    });

    const startTextChatHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'session:startTextChat',
    )?.[1] as (
      event: { sender: { send: (channel: string, payload: unknown) => void } },
      req: unknown,
    ) => Promise<{ streamId: string }>;
    const cancelTextChatHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'session:cancelTextChat',
    )?.[1] as (_event: unknown, req: { streamId: string }) => Promise<void>;

    const { streamId } = await startTextChatHandler(
      { sender },
      {
        messages: [{ role: 'user', content: 'Summarize the current screen' }],
      },
    );

    await vi.waitFor(() => {
      expect(sender.send).toHaveBeenCalledWith('session:textChatEvent', {
        streamId,
        event: { type: 'text-delta', text: 'Here is ' },
      });
      expect(sender.send).toHaveBeenCalledWith('session:textChatEvent', {
        streamId,
        event: { type: 'completed' },
      });
    });

    await expect(cancelTextChatHandler({}, { streamId })).resolves.toBeUndefined();
  });

  it('validates and delegates chat memory handlers through the chat memory service', async () => {
    const chatMemoryService = createChatMemoryServiceDouble();
    const settingsService = createSettingsServiceDouble();
    const { registerIpcHandlers } = await import('./registerIpcHandlers');

    registerIpcHandlers({
      chatMemoryService,
      getMainWindow: () => null,
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
    const appendMessageHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === 'chatMemory:appendMessage',
    )?.[1] as (_event: unknown, req: unknown) => Promise<ChatMessageRecord>;

    await expect(createChatHandler({}, { title: 5 })).rejects.toThrow(
      'Invalid create chat payload',
    );
    await expect(getChatHandler({}, '')).rejects.toThrow('Invalid chat id');
    await expect(listMessagesHandler({}, '')).rejects.toThrow('Invalid chat id');
    await expect(
      appendMessageHandler({}, { chatId: 'chat-1', role: 'system', contentText: 'bad' }),
    ).rejects.toThrow('Invalid append chat message payload');

    await expect(createChatHandler({}, { title: 'New chat' })).resolves.toEqual(
      createChatRecord(),
    );
    await expect(getChatHandler({}, 'chat-1')).resolves.toEqual(createChatRecord());
    await expect(getOrCreateCurrentChatHandler()).resolves.toEqual(createChatRecord());
    await expect(listMessagesHandler({}, 'chat-1')).resolves.toEqual([
      createChatMessageRecord(),
    ]);
    await expect(
      appendMessageHandler({}, { chatId: 'chat-1', role: 'assistant', contentText: 'Stored' }),
    ).resolves.toEqual(
      createChatMessageRecord({
        role: 'assistant',
        contentText: 'Stored',
      }),
    );

    expect(chatMemoryService.createChat).toHaveBeenCalledWith({ title: 'New chat' });
    expect(chatMemoryService.getChat).toHaveBeenCalledWith('chat-1');
    expect(chatMemoryService.getOrCreateCurrentChat).toHaveBeenCalledTimes(1);
    expect(chatMemoryService.listMessages).toHaveBeenCalledWith('chat-1');
    expect(chatMemoryService.appendMessage).toHaveBeenCalledWith({
      chatId: 'chat-1',
      role: 'assistant',
      contentText: 'Stored',
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
