import type {
  EndLiveSessionRequest,
  LiveSessionRecord,
  UpdateLiveSessionRequest,
} from '@livepair/shared-types';
import { getCurrentChat } from '../chatMemory/currentChatMemory';
import type { ActiveChatQueryBridge } from '../chatMemory/queries';
import {
  createPersistedLiveSession,
  endPersistedLiveSession,
  listPersistedLiveSessions,
  type LiveSessionsBridge,
  updatePersistedLiveSession,
} from './queries';

type CurrentLiveSessionBridge = ActiveChatQueryBridge & LiveSessionsBridge;

let activeLiveSession: LiveSessionRecord | null = null;

function isRestoreCandidate(candidate: LiveSessionRecord): boolean {
  return (
    candidate.restorable &&
    candidate.resumptionHandle !== null &&
    candidate.invalidatedAt === null
  );
}

function isSkippedActiveNonRestorableSession(candidate: LiveSessionRecord): boolean {
  return (
    candidate.status === 'active' &&
    candidate.endedAt === null &&
    !candidate.restorable
  );
}

export async function startCurrentLiveSession(
  bridge: CurrentLiveSessionBridge = window.bridge,
): Promise<LiveSessionRecord> {
  if (activeLiveSession) {
    return activeLiveSession;
  }

  const chat = await getCurrentChat(bridge);
  const liveSession = await createPersistedLiveSession({
    chatId: chat.id,
    startedAt: new Date().toISOString(),
  }, bridge);

  activeLiveSession = liveSession;
  return liveSession;
}

export async function restoreCurrentLiveSession(
  bridge: CurrentLiveSessionBridge = window.bridge,
): Promise<LiveSessionRecord | null> {
  if (activeLiveSession) {
    return activeLiveSession;
  }

  const chat = await getCurrentChat(bridge);
  const liveSessions = await listPersistedLiveSessions(chat.id, bridge);
  const liveSession = liveSessions.find(isRestoreCandidate) ?? null;

  if (liveSession === null) {
    const skippedSessions = liveSessions.filter(isSkippedActiveNonRestorableSession);

    await Promise.all(
      skippedSessions.map((session) =>
        endPersistedLiveSession({
          id: session.id,
          endedAt: new Date().toISOString(),
          status: 'failed',
          endedReason:
            session.invalidationReason
            ?? 'Skipped non-restorable persisted Live session during startup',
        }, bridge),
      ),
    );
  }

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

  const updatedLiveSession = await updatePersistedLiveSession({
    id: activeLiveSession.id,
    ...request,
  }, bridge);

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
    const endedLiveSession = await endPersistedLiveSession({
      id: liveSessionId,
      endedAt: request.endedAt ?? new Date().toISOString(),
      status: request.status,
      endedReason: request.endedReason ?? null,
    }, bridge);
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
