import type {
  AppendChatMessageRequest,
  ChatMessageRecord,
  ChatRecord,
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
  'appendChatMessage' | 'getOrCreateCurrentChat' | 'listChatMessages' | 'listLiveSessions'
>;

type HydratedCurrentChat = {
  chat: ChatRecord;
  messages: ChatMessageRecord[];
};

let activeChat: ChatRecord | null = null;
let pendingHydration: Promise<HydratedCurrentChat> | null = null;
let pendingAppend: Promise<void> = Promise.resolve();

async function ensureActiveChat(
  bridge: CurrentChatMemoryBridge = window.bridge,
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
  bridge: CurrentChatMemoryBridge = window.bridge,
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
  const [messages, liveSessions] = await Promise.all([
    bridge.listChatMessages(chat.id),
    bridge.listLiveSessions(chat.id),
  ]);
  const latestLiveSession = liveSessions[0] ?? null;

  return buildRehydrationPacket(messages, getPersistedSnapshotInputs(latestLiveSession));
}

function getPersistedSnapshotInputs(
  liveSession: LiveSessionRecord | null,
): Parameters<typeof buildRehydrationPacket>[1] {
  if (liveSession === null) {
    return {};
  }

  return {
    summary: liveSession.summarySnapshot ?? null,
    contextState: liveSession.contextStateSnapshot ?? null,
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

export function resetCurrentChatMemoryForTests(): void {
  activeChat = null;
  pendingHydration = null;
  pendingAppend = Promise.resolve();
}
