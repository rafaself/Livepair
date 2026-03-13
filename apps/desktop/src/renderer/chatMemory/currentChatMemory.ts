import type {
  AppendChatMessageRequest,
  ChatMessageRecord,
  ChatRecord,
} from '@livepair/shared-types';
import { useSessionStore } from '../store/sessionStore';
import { mapChatMessageRecordsToConversationTurns } from '../runtime/conversation/chatMessageAdapter';

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
    const messages = await bridge.listChatMessages(chat.id);

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
