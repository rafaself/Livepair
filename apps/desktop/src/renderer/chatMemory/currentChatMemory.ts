import type {
  AppendChatMessageRequest,
  ChatId,
  ChatMessageRecord,
  ChatRecord,
  DurableChatSummaryRecord,
  RehydrationPacket,
  LiveSessionRecord,
} from '@livepair/shared-types';
import { useSessionStore } from '../store/sessionStore';
import { mapChatMessageRecordsToConversationTurns } from '../runtime/public';
import { buildRehydrationPacket } from './rehydrationPacket';
import {
  appendPersistedChatMessage,
  createChatRecord,
  getChatRecord,
  getOrCreateCurrentChatRecord,
  getPersistedChatSummary,
  listPersistedChatMessages,
  type ActiveChatQueryBridge,
  type ChatMemoryQueriesBridge,
} from './queries';
import {
  getLatestPersistedLiveSession,
  type LiveSessionsBridge,
} from '../liveSessions/queries';

type CurrentChatMemoryBridge = ChatMemoryQueriesBridge & Pick<
  LiveSessionsBridge,
  'listLiveSessions'
>;

type HydratedCurrentChat = {
  chat: ChatRecord;
  messages: ChatMessageRecord[];
};

let activeChat: ChatRecord | null = null;
let pendingHydration: Promise<HydratedCurrentChat> | null = null;
let pendingAppend: Promise<void> = Promise.resolve();

function setActiveChatState(
  chat: ChatRecord,
  messages: readonly ChatMessageRecord[],
): void {
  activeChat = chat;
  pendingHydration = null;
  pendingAppend = Promise.resolve();

  const store = useSessionStore.getState();
  const { screenCaptureSources, selectedScreenCaptureSourceId, overlayDisplay } = store;
  store.reset({
    activeChatId: chat.id,
    screenCaptureSources,
    selectedScreenCaptureSourceId,
    overlayDisplay,
  });
  store.replaceConversationTurns(mapChatMessageRecordsToConversationTurns([...messages]));
}

async function ensureActiveChat(
  bridge: ActiveChatQueryBridge = window.bridge,
): Promise<ChatRecord> {
  if (activeChat) {
    return activeChat;
  }

  const chat = await getOrCreateCurrentChatRecord(bridge);
  activeChat = chat;
  useSessionStore.getState().setActiveChatId(chat.id);
  return chat;
}

export async function getCurrentChat(
  bridge: ActiveChatQueryBridge = window.bridge,
): Promise<ChatRecord> {
  return ensureActiveChat(bridge);
}

export function getCachedActiveChatRecord(chatId?: ChatId): ChatRecord | null {
  if (activeChat === null) {
    return null;
  }

  if (typeof chatId === 'string' && activeChat.id !== chatId) {
    return null;
  }

  return activeChat;
}

export async function hydrateCurrentChat(
  bridge: CurrentChatMemoryBridge = window.bridge,
): Promise<HydratedCurrentChat> {
  if (pendingHydration !== null) {
    return pendingHydration;
  }

  pendingHydration = (async () => {
    const chat = await ensureActiveChat(bridge);
    const messages = await listCurrentChatMessages(bridge);

    useSessionStore
      .getState()
      .replaceConversationTurns(mapChatMessageRecordsToConversationTurns(messages));

    return {
      chat,
      messages,
    };
  })();

  try {
    return await pendingHydration;
  } finally {
    pendingHydration = null;
  }
}

export async function listCurrentChatMessages(
  bridge: CurrentChatMemoryBridge = window.bridge,
): Promise<ChatMessageRecord[]> {
  const chat = await ensureActiveChat(bridge);
  return listPersistedChatMessages(chat.id, bridge);
}

export async function buildRehydrationPacketFromCurrentChat(
  bridge: CurrentChatMemoryBridge = window.bridge,
): Promise<RehydrationPacket> {
  const chat = await ensureActiveChat(bridge);
  const [messages, chatSummary, latestLiveSession] = await Promise.all([
    listPersistedChatMessages(chat.id, bridge),
    getPersistedChatSummary(chat.id, bridge),
    getLatestPersistedLiveSession(chat.id, bridge),
  ]);

  return buildRehydrationPacket(
    messages,
    getPersistedSnapshotInputs(messages, chatSummary, latestLiveSession),
  );
}

function getPersistedSnapshotInputs(
  messages: readonly ChatMessageRecord[],
  chatSummary: DurableChatSummaryRecord | null,
  liveSession: LiveSessionRecord | null,
): Parameters<typeof buildRehydrationPacket>[1] {
  const latestMessageSequence = messages[messages.length - 1]?.sequence ?? null;
  const hasValidChatSummary =
    chatSummary !== null
    && chatSummary.summaryText.trim().length > 0
    && Number.isFinite(chatSummary.coveredThroughSequence)
    && chatSummary.coveredThroughSequence > 0;
  const hasFreshChatSummary =
    hasValidChatSummary
    && latestMessageSequence !== null
    && chatSummary.coveredThroughSequence <= latestMessageSequence;

  if (liveSession === null && !hasFreshChatSummary) {
    return {};
  }

  return {
    summary: hasFreshChatSummary
      ? chatSummary.summaryText
      : liveSession?.summarySnapshot ?? null,
    summaryCoveredThroughSequence: hasFreshChatSummary
      ? chatSummary.coveredThroughSequence
      : null,
    contextState: liveSession?.contextStateSnapshot ?? null,
  };
}

export async function appendMessageToCurrentChat(
  request: Omit<AppendChatMessageRequest, 'chatId'>,
  bridge: CurrentChatMemoryBridge = window.bridge,
): Promise<ChatMessageRecord | null> {
  const contentText = request.contentText.trim();

  if (contentText.length === 0) {
    return null;
  }

  const task = pendingAppend.then(async () => {
    const chat = await ensureActiveChat(bridge);

    return appendPersistedChatMessage({
      chatId: chat.id,
      role: request.role,
      contentText,
    }, bridge);
  });

  pendingAppend = task.then(
    () => undefined,
    () => undefined,
  );

  return task;
}

export async function switchToChat(
  chatId: ChatId,
  bridge: CurrentChatMemoryBridge = window.bridge,
): Promise<void> {
  const chat = await getChatRecord(chatId, bridge);

  if (!chat) {
    throw new Error(`Chat not found: ${chatId}`);
  }

  const messages = await listPersistedChatMessages(chat.id, bridge);
  setActiveChatState(chat, messages);
}

export async function createAndSwitchToNewChat(
  bridge: CurrentChatMemoryBridge = window.bridge,
): Promise<ChatRecord> {
  const chat = await createChatRecord(undefined, bridge);
  setActiveChatState(chat, []);
  return chat;
}

export function resetCurrentChatMemoryForTests(): void {
  activeChat = null;
  pendingHydration = null;
  pendingAppend = Promise.resolve();
}
