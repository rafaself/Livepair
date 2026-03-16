import type {
  ChatId,
  CreateLiveSessionRequest,
  EndLiveSessionRequest,
  LiveSessionRecord,
  UpdateLiveSessionRequest,
} from '@livepair/shared-types';

export type LiveSessionsBridge = Pick<
  typeof window.bridge,
  'createLiveSession' | 'endLiveSession' | 'listLiveSessions' | 'updateLiveSession'
>;

export function createPersistedLiveSession(
  request: CreateLiveSessionRequest,
  bridge: Pick<LiveSessionsBridge, 'createLiveSession'> = window.bridge,
): Promise<LiveSessionRecord> {
  return bridge.createLiveSession(request);
}

export function endPersistedLiveSession(
  request: EndLiveSessionRequest,
  bridge: Pick<LiveSessionsBridge, 'endLiveSession'> = window.bridge,
): Promise<LiveSessionRecord> {
  return bridge.endLiveSession(request);
}

export async function getLatestPersistedLiveSession(
  chatId: ChatId,
  bridge: Pick<LiveSessionsBridge, 'listLiveSessions'> = window.bridge,
): Promise<LiveSessionRecord | null> {
  const liveSessions = await bridge.listLiveSessions(chatId, { limit: 1 });
  return liveSessions[0] ?? null;
}

export function listPersistedLiveSessions(
  chatId: ChatId,
  bridge: Pick<LiveSessionsBridge, 'listLiveSessions'> = window.bridge,
): Promise<LiveSessionRecord[]> {
  return bridge.listLiveSessions(chatId);
}

export function updatePersistedLiveSession(
  request: UpdateLiveSessionRequest,
  bridge: Pick<LiveSessionsBridge, 'updateLiveSession'> = window.bridge,
): Promise<LiveSessionRecord> {
  return bridge.updateLiveSession(request);
}
