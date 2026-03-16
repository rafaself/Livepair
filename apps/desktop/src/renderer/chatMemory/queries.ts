import type {
  AppendChatMessageRequest,
  ChatId,
  ChatMessageRecord,
  ChatRecord,
  CreateChatRequest,
  DurableChatSummaryRecord,
} from '@livepair/shared-types';

export type ChatMemoryQueriesBridge = Pick<
  typeof window.bridge,
  | 'appendChatMessage'
  | 'createChat'
  | 'getChat'
  | 'getCurrentChat'
  | 'getOrCreateCurrentChat'
  | 'getChatSummary'
  | 'listChatMessages'
  | 'listChats'
>;

export type CurrentChatQueryBridge = Pick<
  ChatMemoryQueriesBridge,
  'getCurrentChat'
>;

export type ActiveChatQueryBridge = Pick<
  ChatMemoryQueriesBridge,
  'getOrCreateCurrentChat'
>;

export function appendPersistedChatMessage(
  request: AppendChatMessageRequest,
  bridge: Pick<ChatMemoryQueriesBridge, 'appendChatMessage'> = window.bridge,
): Promise<ChatMessageRecord> {
  return bridge.appendChatMessage(request);
}

export function createChatRecord(
  request?: CreateChatRequest,
  bridge: Pick<ChatMemoryQueriesBridge, 'createChat'> = window.bridge,
): Promise<ChatRecord> {
  return bridge.createChat(request);
}

export function getChatRecord(
  chatId: ChatId,
  bridge: Pick<ChatMemoryQueriesBridge, 'getChat'> = window.bridge,
): Promise<ChatRecord | null> {
  return bridge.getChat(chatId);
}

export function getCurrentChatRecord(
  bridge: CurrentChatQueryBridge = window.bridge,
): Promise<ChatRecord | null> {
  return bridge.getCurrentChat();
}

export async function getLatestPersistedChatMessage(
  chatId: ChatId,
  bridge: Pick<ChatMemoryQueriesBridge, 'listChatMessages'> = window.bridge,
): Promise<ChatMessageRecord | null> {
  const messages = await bridge.listChatMessages(chatId, { limit: 1 });
  return messages[0] ?? null;
}

export function getOrCreateCurrentChatRecord(
  bridge: ActiveChatQueryBridge = window.bridge,
): Promise<ChatRecord> {
  return bridge.getOrCreateCurrentChat();
}

export function getPersistedChatSummary(
  chatId: ChatId,
  bridge: Pick<ChatMemoryQueriesBridge, 'getChatSummary'> = window.bridge,
): Promise<DurableChatSummaryRecord | null> {
  return bridge.getChatSummary(chatId);
}

export function listPersistedChatMessages(
  chatId: ChatId,
  bridge: Pick<ChatMemoryQueriesBridge, 'listChatMessages'> = window.bridge,
): Promise<ChatMessageRecord[]> {
  return bridge.listChatMessages(chatId);
}

export function listPersistedChats(
  bridge: Pick<ChatMemoryQueriesBridge, 'listChats'> = window.bridge,
): Promise<ChatRecord[]> {
  return bridge.listChats();
}
