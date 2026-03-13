import type { useSessionStore } from '../../store/sessionStore';
import { appendMessageToCurrentChat } from '../../chatMemory/currentChatMemory';
import type { AssistantDraftModel } from './conversationTurnManager';

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
    turn.state === 'error' ||
    turn.persistedMessageId
  ) {
    return;
  }

  if (turn.role !== 'user' && turn.role !== 'assistant') {
    return;
  }

  if (turn.role === 'assistant' && turn.source === 'voice') {
    return;
  }

  const role = turn.role;

  const inFlightPersist = pendingPersistByEntryId.get(turnId);

  if (inFlightPersist) {
    return inFlightPersist;
  }

  const persistTask = (async () => {
    const record = await appendMessageToCurrentChat({
      role,
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

export async function persistAssistantDraft(
  store: SessionStoreApi,
  draft: Pick<AssistantDraftModel, 'id' | 'content'>,
  annotateTurnId?: string | null,
): Promise<void> {
  const contentText = draft.content.trim();

  if (contentText.length === 0) {
    return;
  }

  const inFlightPersist = pendingPersistByEntryId.get(draft.id);

  if (inFlightPersist) {
    return inFlightPersist;
  }

  const persistTask = (async () => {
    const record = await appendMessageToCurrentChat({
      role: 'assistant',
      contentText,
    });

    if (!record || !annotateTurnId) {
      return;
    }

    const latestTurn = store.getState().conversationTurns.find((entry) => entry.id === annotateTurnId);

    if (!latestTurn || latestTurn.persistedMessageId) {
      return;
    }

    store.getState().updateConversationTurn(annotateTurnId, {
      persistedMessageId: record.id,
    });
  })();

  pendingPersistByEntryId.set(draft.id, persistTask);

  try {
    await persistTask;
  } finally {
    pendingPersistByEntryId.delete(draft.id);
  }
}

export function persistAssistantDraftInBackground(
  store: SessionStoreApi,
  draft: Pick<AssistantDraftModel, 'id' | 'content'> | null,
  annotateTurnId?: string | null,
): void {
  if (!draft) {
    return;
  }

  void persistAssistantDraft(store, draft, annotateTurnId).catch(() => {});
}
