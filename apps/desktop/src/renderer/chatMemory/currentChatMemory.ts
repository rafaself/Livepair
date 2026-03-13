import type {
  AppendChatMessageRequest,
  ChatMessageRecord,
  ChatRecord,
  TextChatRequest,
} from '@livepair/shared-types';
import { useSessionStore } from '../store/sessionStore';
import {
  mapChatMessageRecordsToConversationTurns,
  mapChatMessageRecordsToTextChatMessages,
} from '../runtime/conversation/chatMessageAdapter';
import type { LiveSessionHistoryTurn } from '../runtime/transport/transport.types';

type CurrentChatMemoryBridge = Pick<
  typeof window.bridge,
  'appendChatMessage' | 'getOrCreateCurrentChat' | 'listChatMessages'
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

export async function buildTextChatRequestFromCurrentChat(
  bridge: CurrentChatMemoryBridge = window.bridge,
): Promise<TextChatRequest> {
  const messages = await listCurrentChatMessages(bridge);

  return {
    messages: mapChatMessageRecordsToTextChatMessages(messages),
  };
}

function mapChatMessageRecordsToLiveSessionHistory(
  records: readonly ChatMessageRecord[],
): LiveSessionHistoryTurn[] {
  return [...records]
    .sort((left, right) => left.sequence - right.sequence)
    .map((record) => ({
      role: record.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: record.contentText }],
    }));
}

export async function buildLiveSessionHistoryFromCurrentChat(
  bridge: CurrentChatMemoryBridge = window.bridge,
): Promise<LiveSessionHistoryTurn[]> {
  const messages = await listCurrentChatMessages(bridge);
  return mapChatMessageRecordsToLiveSessionHistory(messages);
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
