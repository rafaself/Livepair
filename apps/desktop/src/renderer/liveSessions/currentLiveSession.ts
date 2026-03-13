import type {
  EndLiveSessionRequest,
  LiveSessionRecord,
} from '@livepair/shared-types';
import { getCurrentChat } from '../chatMemory/currentChatMemory';

type CurrentLiveSessionBridge = Pick<
  typeof window.bridge,
  'createLiveSession' | 'endLiveSession'
>;

let activeLiveSession: LiveSessionRecord | null = null;

export async function startCurrentLiveSession(
  bridge: CurrentLiveSessionBridge = window.bridge,
): Promise<LiveSessionRecord> {
  if (activeLiveSession) {
    return activeLiveSession;
  }

  const chat = await getCurrentChat();
  const liveSession = await bridge.createLiveSession({
    chatId: chat.id,
    startedAt: new Date().toISOString(),
  });

  activeLiveSession = liveSession;
  return liveSession;
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
