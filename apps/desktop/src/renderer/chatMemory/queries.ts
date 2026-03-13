import type {
  AppendChatMessageRequest,
  ChatId,
  ChatMessageRecord,
  ChatRecord,
  DurableChatSummaryRecord,
} from '@livepair/shared-types';

export type ChatMemoryQueriesBridge = Pick<
  typeof window.bridge,
  | 'appendChatMessage'
  | 'getChat'
  | 'getOrCreateCurrentChat'
  | 'getChatSummary'
  | 'listChatMessages'
  | 'listChats'
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

export function getChatRecord(
  chatId: ChatId,
  bridge: Pick<ChatMemoryQueriesBridge, 'getChat'> = window.bridge,
): Promise<ChatRecord | null> {
  return bridge.getChat(chatId);
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
