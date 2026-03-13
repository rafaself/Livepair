import type { useSessionStore } from '../../store/sessionStore';
import { appendMessageToCurrentChat } from '../../chatMemory/currentChatMemory';

type SessionStoreApi = Pick<typeof useSessionStore, 'getState'>;

export async function persistConversationTurn(
  store: SessionStoreApi,
  turnId: string,
): Promise<void> {
  const turn = store.getState().conversationTurns.find((entry) => entry.id === turnId);

  if (
    !turn ||
    turn.role === 'system' ||
    turn.content.trim().length === 0 ||
    turn.state === 'streaming' ||
    turn.persistedMessageId
  ) {
    return;
  }

  const record = await appendMessageToCurrentChat({
    role: turn.role,
    contentText: turn.content,
  });

  if (!record) {
    return;
  }

  const latestTurn = store.getState().conversationTurns.find((entry) => entry.id === turnId);

  if (!latestTurn || latestTurn.persistedMessageId) {
    return;
  }

  store.getState().updateConversationTurn(turnId, {
    persistedMessageId: record.id,
  });
}

export function persistConversationTurnInBackground(
  store: SessionStoreApi,
  turnId: string | null,
): void {
  if (!turnId) {
    return;
  }

  void persistConversationTurn(store, turnId).catch(() => {});
}
