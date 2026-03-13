import type {
  EndLiveSessionRequest,
  LiveSessionRecord,
  UpdateLiveSessionRequest,
} from '@livepair/shared-types';

type CurrentLiveSessionBridge = Pick<
  typeof window.bridge,
  'createLiveSession' | 'getOrCreateCurrentChat' | 'listLiveSessions' | 'updateLiveSession' | 'endLiveSession'
>;

let activeLiveSession: LiveSessionRecord | null = null;

function isRestorableLiveSession(candidate: LiveSessionRecord): boolean {
  return (
    candidate.status === 'active' &&
    candidate.endedAt === null &&
    candidate.restorable &&
    candidate.resumptionHandle !== null &&
    candidate.invalidatedAt === null
  );
}

export async function startCurrentLiveSession(
  bridge: CurrentLiveSessionBridge = window.bridge,
): Promise<LiveSessionRecord> {
  if (activeLiveSession) {
    return activeLiveSession;
  }

  const chat = await bridge.getOrCreateCurrentChat();
  const liveSession = await bridge.createLiveSession({
    chatId: chat.id,
    startedAt: new Date().toISOString(),
  });

  activeLiveSession = liveSession;
  return liveSession;
}

export async function restoreCurrentLiveSession(
  bridge: CurrentLiveSessionBridge = window.bridge,
): Promise<LiveSessionRecord | null> {
  if (activeLiveSession) {
    return activeLiveSession;
  }

  const chat = await bridge.getOrCreateCurrentChat();
  const liveSessions = await bridge.listLiveSessions(chat.id);
  const liveSession = liveSessions.find(isRestorableLiveSession) ?? null;

  activeLiveSession = liveSession;
  return liveSession;
}

export async function updateCurrentLiveSession(
  request: Omit<UpdateLiveSessionRequest, 'id'>,
  bridge: CurrentLiveSessionBridge = window.bridge,
): Promise<LiveSessionRecord | null> {
  if (!activeLiveSession) {
    return null;
  }

  const updatedLiveSession = await bridge.updateLiveSession({
    id: activeLiveSession.id,
    ...request,
  });

  activeLiveSession = updatedLiveSession;
  return updatedLiveSession;
}

export async function endCurrentLiveSession(
  request: Omit<EndLiveSessionRequest, 'id'>,
  bridge: CurrentLiveSessionBridge = window.bridge,
): Promise<LiveSessionRecord | null> {
  if (!activeLiveSession) {
    return null;
  }

  const liveSessionId = activeLiveSession.id;

  try {
    const endedLiveSession = await bridge.endLiveSession({
      id: liveSessionId,
      endedAt: request.endedAt ?? new Date().toISOString(),
      status: request.status,
      endedReason: request.endedReason ?? null,
    });
    activeLiveSession = null;
    return endedLiveSession;
  } catch (error) {
    activeLiveSession = null;
    throw error;
  }
}

export function resetCurrentLiveSessionForTests(): void {
  activeLiveSession = null;
}
