import type {
  AppendChatMessageRequest,
  ChatId,
  ChatMessageRecord,
  ChatRecord,
  DurableChatSummaryRecord,
  LiveSessionRecord,
  RehydrationPacket,
} from '@livepair/shared-types';
import { useSessionStore } from '../store/sessionStore';
import {
  mapChatMessageRecordsToConversationTurns,
} from '../runtime/conversation/chatMessageAdapter';
import type { LiveSessionHistoryTurn } from '../runtime/transport/transport.types';
import { buildRehydrationPacket } from './rehydrationPacket';

type CurrentChatMemoryBridge = Pick<
  typeof window.bridge,
  | 'appendChatMessage'
  | 'getChat'
  | 'getOrCreateCurrentChat'
  | 'listChatMessages'
  | 'getChatSummary'
  | 'listLiveSessions'
>;

type ActiveChatBridge = Pick<typeof window.bridge, 'getOrCreateCurrentChat'>;

type HydratedCurrentChat = {
  chat: ChatRecord;
  messages: ChatMessageRecord[];
};

let activeChat: ChatRecord | null = null;
let pendingHydration: Promise<HydratedCurrentChat> | null = null;
let pendingAppend: Promise<void> = Promise.resolve();

async function ensureActiveChat(
  bridge: ActiveChatBridge = window.bridge,
): Promise<ChatRecord> {
  if (activeChat) {
    return activeChat;
  }

  const chat = await bridge.getOrCreateCurrentChat();
  activeChat = chat;
  useSessionStore.getState().setActiveChatId(chat.id);
  return chat;
}

export async function getCurrentChat(
  bridge: ActiveChatBridge = window.bridge,
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
  return bridge.listChatMessages(chat.id);
}

export async function buildRehydrationPacketFromCurrentChat(
  bridge: CurrentChatMemoryBridge = window.bridge,
): Promise<RehydrationPacket> {
  const chat = await ensureActiveChat(bridge);
  const [messages, chatSummary, liveSessions] = await Promise.all([
    bridge.listChatMessages(chat.id),
    bridge.getChatSummary(chat.id),
    bridge.listLiveSessions(chat.id),
  ]);
  const latestLiveSession = liveSessions[0] ?? null;

  return buildRehydrationPacket(messages, getPersistedSnapshotInputs(chatSummary, latestLiveSession));
}

function getPersistedSnapshotInputs(
  chatSummary: DurableChatSummaryRecord | null,
  liveSession: LiveSessionRecord | null,
): Parameters<typeof buildRehydrationPacket>[1] {
  const hasValidChatSummary =
    chatSummary !== null
    && chatSummary.summaryText.trim().length > 0
    && Number.isFinite(chatSummary.coveredThroughSequence)
    && chatSummary.coveredThroughSequence > 0;

  if (liveSession === null && !hasValidChatSummary) {
    return {};
  }

  return {
    summary: hasValidChatSummary
      ? chatSummary.summaryText
      : liveSession?.summarySnapshot ?? null,
    summaryCoveredThroughSequence: hasValidChatSummary
      ? chatSummary.coveredThroughSequence
      : null,
    contextState: liveSession?.contextStateSnapshot ?? null,
  };
}

export function mapRehydrationPacketToLiveSessionHistory(
  packet: RehydrationPacket,
): LiveSessionHistoryTurn[] {
  return packet.recentTurns.map((turn) => ({
    role: turn.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: turn.text }],
  }));
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

    return bridge.appendChatMessage({
      chatId: chat.id,
      role: request.role,
      contentText,
    });
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
  const chat = await bridge.getChat(chatId);

  if (!chat) {
    throw new Error(`Chat not found: ${chatId}`);
  }

  activeChat = chat;
  pendingHydration = null;
  pendingAppend = Promise.resolve();

  const messages = await bridge.listChatMessages(chat.id);
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
