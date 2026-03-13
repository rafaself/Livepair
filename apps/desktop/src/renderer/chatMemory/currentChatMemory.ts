import type {
  AppendChatMessageRequest,
  ChatId,
  ChatMessageRecord,
  ChatRecord,
  DurableChatSummaryRecord,
  RehydrationPacket,
} from '@livepair/shared-types';
import { useSessionStore } from '../store/sessionStore';
import { mapChatMessageRecordsToConversationTurns } from '../runtime/public';
import { buildRehydrationPacket } from './rehydrationPacket';
import {
  appendPersistedChatMessage,
  getChatRecord,
  getOrCreateCurrentChatRecord,
  getPersistedChatSummary,
  listPersistedChatMessages,
  type ActiveChatQueryBridge,
  type ChatMemoryQueriesBridge,
} from './queries';
import {
  listPersistedLiveSessions,
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
  const [messages, chatSummary, liveSessions] = await Promise.all([
    listPersistedChatMessages(chat.id, bridge),
    getPersistedChatSummary(chat.id, bridge),
    listPersistedLiveSessions(chat.id, bridge),
  ]);
  const latestLiveSession = liveSessions[0] ?? null;

  return buildRehydrationPacket(
    messages,
    getPersistedSnapshotInputs(messages, chatSummary, latestLiveSession),
  );
}

function getPersistedSnapshotInputs(
  messages: readonly ChatMessageRecord[],
  chatSummary: DurableChatSummaryRecord | null,
  liveSession: Awaited<ReturnType<typeof listPersistedLiveSessions>>[number] | null,
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

  activeChat = chat;
  pendingHydration = null;
  pendingAppend = Promise.resolve();

  const messages = await listPersistedChatMessages(chat.id, bridge);
  const turns = mapChatMessageRecordsToConversationTurns(messages);

  const store = useSessionStore.getState();
  store.reset({ activeChatId: chat.id });
  store.replaceConversationTurns(turns);
}

export function resetCurrentChatMemoryForTests(): void {
  activeChat = null;
  pendingHydration = null;
  pendingAppend = Promise.resolve();
}
