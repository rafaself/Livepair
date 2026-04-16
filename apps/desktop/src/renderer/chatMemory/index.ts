export {
  appendPersistedChatMessage,
  getLatestPersistedChatMessage,
  getChatRecord,
  getOrCreateCurrentChatRecord,
  getPersistedChatSummary,
  listPersistedChatMessages,
  listPersistedChats,
  updatePersistedChatMessage,
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
  updateMessageInCurrentChat,
} from './currentChatMemory';
