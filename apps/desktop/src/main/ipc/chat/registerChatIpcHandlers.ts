import type { ChatMemoryListOptions } from '@livepair/shared-types';
import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared';
import type { BackendClient } from '../../backend/backendClient';
import { createBackendClient } from '../../backend/backendClient';
import {
  isAppendChatMessageRequest,
  isChatId,
  isChatMemoryListOptions,
  isCreateChatRequest,
  isCreateLiveSessionRequest,
  isEndLiveSessionRequest,
  isUpdateLiveSessionRequest,
} from '../validators/chatValidators';

function requireChatId(chatId: unknown): string {
  if (!isChatId(chatId)) {
    throw new Error('Invalid chat id');
  }

  return chatId;
}

function requireChatListOptions(options: unknown): ChatMemoryListOptions | undefined {
  if (!isChatMemoryListOptions(options)) {
    throw new Error('Invalid chat list options');
  }

  return options;
}

type ChatBackendClient = Pick<
  BackendClient,
  | 'appendChatMessage'
  | 'createChat'
  | 'createLiveSession'
  | 'endLiveSession'
  | 'getChat'
  | 'getCurrentChat'
  | 'getChatSummary'
  | 'getOrCreateCurrentChat'
  | 'listChatMessages'
  | 'listChats'
  | 'listLiveSessions'
  | 'updateLiveSession'
>;

type RegisterChatIpcHandlersOptions = {
  fetchImpl?: typeof fetch | undefined;
};

function createChatBackendClient({
  fetchImpl = fetch,
}: RegisterChatIpcHandlersOptions): ChatBackendClient {
  return createBackendClient({
    fetchImpl,
  });
}

export function registerChatIpcHandlers(
  options: RegisterChatIpcHandlersOptions,
): void {
  const backendClient = createChatBackendClient(options);

  ipcMain.handle(IPC_CHANNELS.createChat, async (_event, req: unknown) => {
    if (!isCreateChatRequest(req)) {
      throw new Error('Invalid create chat payload');
    }

    return backendClient.createChat(req);
  });

  ipcMain.handle(IPC_CHANNELS.getChat, async (_event, chatId: unknown) => {
    return backendClient.getChat(requireChatId(chatId));
  });

  ipcMain.handle(IPC_CHANNELS.getCurrentChat, async () => {
    return backendClient.getCurrentChat();
  });

  ipcMain.handle(IPC_CHANNELS.getOrCreateCurrentChat, async () => {
    return backendClient.getOrCreateCurrentChat();
  });

  ipcMain.handle(IPC_CHANNELS.listChats, async () => {
    return backendClient.listChats();
  });

  ipcMain.handle(IPC_CHANNELS.listChatMessages, async (
    _event,
    chatId: unknown,
    options: unknown,
  ) => {
    return backendClient.listChatMessages(
      requireChatId(chatId),
      requireChatListOptions(options),
    );
  });

  ipcMain.handle(IPC_CHANNELS.getChatSummary, async (_event, chatId: unknown) => {
    return backendClient.getChatSummary(requireChatId(chatId));
  });

  ipcMain.handle(IPC_CHANNELS.appendChatMessage, async (_event, req: unknown) => {
    if (!isAppendChatMessageRequest(req)) {
      throw new Error('Invalid append chat message payload');
    }

    return backendClient.appendChatMessage(req);
  });

  ipcMain.handle(IPC_CHANNELS.createLiveSession, async (_event, req: unknown) => {
    if (!isCreateLiveSessionRequest(req)) {
      throw new Error('Invalid create live session payload');
    }

    return backendClient.createLiveSession(req);
  });

  ipcMain.handle(IPC_CHANNELS.listLiveSessions, async (
    _event,
    chatId: unknown,
    options: unknown,
  ) => {
    return backendClient.listLiveSessions(
      requireChatId(chatId),
      requireChatListOptions(options),
    );
  });

  ipcMain.handle(IPC_CHANNELS.updateLiveSession, async (_event, req: unknown) => {
    if (!isUpdateLiveSessionRequest(req)) {
      throw new Error('Invalid update live session payload');
    }

    return backendClient.updateLiveSession(req);
  });

  ipcMain.handle(IPC_CHANNELS.endLiveSession, async (_event, req: unknown) => {
    if (!isEndLiveSessionRequest(req)) {
      throw new Error('Invalid end live session payload');
    }

    return backendClient.endLiveSession(req);
  });
}
