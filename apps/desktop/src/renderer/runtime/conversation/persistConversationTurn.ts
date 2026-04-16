import type { useSessionStore } from '../../store/sessionStore';
import {
  appendMessageToCurrentChat,
  updateMessageInCurrentChat,
} from '../../chatMemory/currentChatMemory';

type SessionStoreApi = Pick<typeof useSessionStore, 'getState'>;

const pendingPersistByEntryId = new Map<string, Promise<void>>();

export async function persistConversationTurn(
  store: SessionStoreApi,
  turnId: string,
): Promise<void> {
  const turn = store.getState().conversationTurns.find((entry) => entry.id === turnId);

  if (
    !turn ||
    turn.content.trim().length === 0 ||
    turn.state === 'streaming' ||
    turn.state === 'error'
  ) {
    return;
  }

  if (turn.role !== 'user' && turn.role !== 'assistant') {
    return;
  }

  const role = turn.role;

  const inFlightPersist = pendingPersistByEntryId.get(turnId);

  if (inFlightPersist) {
    return inFlightPersist;
  }

  const persistTask = (async () => {
    if (turn.persistedMessageId) {
      await updateMessageInCurrentChat({
        id: turn.persistedMessageId,
        contentText: turn.content,
      });
      return;
    }

    const record = await appendMessageToCurrentChat({
      role,
      contentText: turn.content,
      ...(turn.answerMetadata ? { answerMetadata: turn.answerMetadata } : {}),
    });

    if (!record) {
      return;
    }

    let latestTurn = store.getState().conversationTurns.find((entry) => entry.id === turnId);

    if (!latestTurn) {
      return;
    }

    if (!latestTurn.persistedMessageId) {
      store.getState().updateConversationTurn(turnId, {
        persistedMessageId: record.id,
      });
      latestTurn = store.getState().conversationTurns.find((entry) => entry.id === turnId);
    }

    let persistedRecord = record;

    while (latestTurn) {
      const latestContentText = latestTurn.content.trim();
      const persistedMessageId = latestTurn.persistedMessageId ?? persistedRecord.id;

      if (
        latestContentText.length === 0
        || latestContentText === persistedRecord.contentText
      ) {
        return;
      }

      const updatedRecord = await updateMessageInCurrentChat({
        id: persistedMessageId,
        contentText: latestContentText,
      });

      if (!updatedRecord) {
        return;
      }

      persistedRecord = updatedRecord;
      latestTurn = store.getState().conversationTurns.find((entry) => entry.id === turnId);
    }
  })();

  pendingPersistByEntryId.set(turnId, persistTask);

  try {
    await persistTask;
  } finally {
    pendingPersistByEntryId.delete(turnId);
  }
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
