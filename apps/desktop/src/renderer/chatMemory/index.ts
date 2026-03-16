export {
  appendPersistedChatMessage,
  getLatestPersistedChatMessage,
  getChatRecord,
  getOrCreateCurrentChatRecord,
  getPersistedChatSummary,
  listPersistedChatMessages,
  listPersistedChats,
  type ActiveChatQueryBridge,
  type ChatMemoryQueriesBridge,
} from './queries';
export {
  buildRehydrationPacketFromCurrentChat,
  createAndSwitchToNewChat,
  getCachedActiveChatRecord,
  getCurrentChat,
  hydrateCurrentChat,
  hydrateCurrentChatIfPresent,
  listCurrentChatMessages,
  resetCurrentChatMemoryForTests,
  switchToChat,
} from './currentChatMemory';
