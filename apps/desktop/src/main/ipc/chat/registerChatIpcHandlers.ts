import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared';
import type { ChatMemoryService } from '../../chatMemory/chatMemoryService';
import {
  isAppendChatMessageRequest,
  isChatId,
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

export function registerChatIpcHandlers({
  chatMemoryService,
}: {
  chatMemoryService: ChatMemoryService;
}): void {
  ipcMain.handle(IPC_CHANNELS.createChat, async (_event, req: unknown) => {
    if (!isCreateChatRequest(req)) {
      throw new Error('Invalid create chat payload');
    }

    return chatMemoryService.createChat(req);
  });

  ipcMain.handle(IPC_CHANNELS.getChat, async (_event, chatId: unknown) => {
    return chatMemoryService.getChat(requireChatId(chatId));
  });

  ipcMain.handle(IPC_CHANNELS.getOrCreateCurrentChat, async () => {
    return chatMemoryService.getOrCreateCurrentChat();
  });

  ipcMain.handle(IPC_CHANNELS.listChats, async () => {
    return chatMemoryService.listChats();
  });

  ipcMain.handle(IPC_CHANNELS.listChatMessages, async (_event, chatId: unknown) => {
    return chatMemoryService.listMessages(requireChatId(chatId));
  });

  ipcMain.handle(IPC_CHANNELS.getChatSummary, async (_event, chatId: unknown) => {
    return chatMemoryService.getChatSummary(requireChatId(chatId));
  });

  ipcMain.handle(IPC_CHANNELS.appendChatMessage, async (_event, req: unknown) => {
    if (!isAppendChatMessageRequest(req)) {
      throw new Error('Invalid append chat message payload');
    }

    return chatMemoryService.appendMessage(req);
  });

  ipcMain.handle(IPC_CHANNELS.createLiveSession, async (_event, req: unknown) => {
    if (!isCreateLiveSessionRequest(req)) {
      throw new Error('Invalid create live session payload');
    }

    return chatMemoryService.createLiveSession(req);
  });

  ipcMain.handle(IPC_CHANNELS.listLiveSessions, async (_event, chatId: unknown) => {
    return chatMemoryService.listLiveSessions(requireChatId(chatId));
  });

  ipcMain.handle(IPC_CHANNELS.updateLiveSession, async (_event, req: unknown) => {
    if (!isUpdateLiveSessionRequest(req)) {
      throw new Error('Invalid update live session payload');
    }

    return chatMemoryService.updateLiveSession(req);
  });

  ipcMain.handle(IPC_CHANNELS.endLiveSession, async (_event, req: unknown) => {
    if (!isEndLiveSessionRequest(req)) {
      throw new Error('Invalid end live session payload');
    }

    return chatMemoryService.endLiveSession(req);
  });
}
