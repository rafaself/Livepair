import { asErrorDetail } from '../core/runtimeUtils';
import { connectFallbackVoiceSession } from '../voice/session/connectFallbackVoiceSession';
import type { SessionStoreApi } from '../core/sessionControllerTypes';
import type { DesktopSession } from '../transport/transport.types';
import type {
  AssistantVoice,
  CreateEphemeralTokenResponse,
  LiveSessionRecord,
  RehydrationPacket,
} from '@livepair/shared-types';
import type { LiveRuntimeDiagnosticEvent } from './liveRuntimeObservability';

type RestoreAttemptResult =
  | { status: 'resumed' }
  | { status: 'failed'; detail: string };

type FallbackAttemptResult =
  | { status: 'connected' }
  | { status: 'failed'; detail: string };

type SessionVoiceConnectionArgs = {
  store: SessionStoreApi;
  isCurrentSessionOperation: (operationId: number) => boolean;
  recordSessionEvent: (event: { type: 'session.ready' }) => void;
  setVoiceResumptionInFlight: (value: boolean) => void;
  resolveSessionVoice: () => Promise<AssistantVoice>;
  createTransport: (options?: { voice?: AssistantVoice }) => DesktopSession;
  activateVoiceTransport: (transport: DesktopSession) => void;
  buildRehydrationPacketFromCurrentChat: () => Promise<RehydrationPacket>;
  invalidatePersistedLiveSession: (patch: {
    restorable: false;
    invalidatedAt: string;
    invalidationReason: string;
  }) => Promise<void>;
  createPersistedLiveSession: (voice: AssistantVoice) => Promise<void>;
  endPersistedLiveSession: (liveSessionEnd: {
    status: 'ended' | 'failed';
    endedReason?: string | null;
  }) => Promise<void>;
  emitDiagnostic?: (event: LiveRuntimeDiagnosticEvent) => void;
  logRuntimeDiagnostic?: (
    scope: 'session' | 'voice-session',
    message: string,
    detail: Record<string, unknown>,
  ) => void;
};

export function createSessionVoiceConnection({
  store,
  isCurrentSessionOperation,
  recordSessionEvent,
  setVoiceResumptionInFlight,
  resolveSessionVoice,
  createTransport,
  activateVoiceTransport,
  buildRehydrationPacketFromCurrentChat,
  invalidatePersistedLiveSession,
  createPersistedLiveSession,
  endPersistedLiveSession,
  emitDiagnostic,
  logRuntimeDiagnostic,
}: SessionVoiceConnectionArgs) {
  const reportDiagnostic = (event: LiveRuntimeDiagnosticEvent): void => {
    if (emitDiagnostic) {
      emitDiagnostic(event);
      return;
    }

    logRuntimeDiagnostic?.('voice-session', event.name, {
      ...(event.detail ? { detail: event.detail } : {}),
      ...event.data,
    });
  };
  const connectRestoredSession = async (
    operationId: number,
    token: CreateEphemeralTokenResponse,
    liveSession: LiveSessionRecord,
  ): Promise<RestoreAttemptResult> => {
    if (!liveSession.restorable || !liveSession.resumptionHandle) {
      const detail = liveSession.restorable
        ? 'Persisted Live session is missing a resume handle'
        : liveSession.invalidationReason ?? 'Persisted Live session is no longer restorable';
      await invalidatePersistedLiveSession({
        restorable: false,
        invalidatedAt: new Date().toISOString(),
        invalidationReason: detail,
      });
      await endPersistedLiveSession({
        status: 'failed',
        endedReason: detail,
      });
      return { status: 'failed', detail };
    }

    store.getState().setLastRuntimeError(null);
    store.getState().setVoiceSessionResumption({
      status: 'reconnecting',
      latestHandle: liveSession.resumptionHandle,
      resumable: true,
      lastDetail: 'Restoring persisted Live session',
    });
    setVoiceResumptionInFlight(true);

    let transport: DesktopSession;
    try {
      transport = createTransport({
        ...(liveSession.voice ? { voice: liveSession.voice } : {}),
      });
    } catch (error) {
      const detail = asErrorDetail(error, 'Failed to prepare voice session');
      await invalidatePersistedLiveSession({
        restorable: false,
        invalidatedAt: new Date().toISOString(),
        invalidationReason: detail,
      });
      await endPersistedLiveSession({
        status: 'failed',
        endedReason: detail,
      });
      setVoiceResumptionInFlight(false);
      return { status: 'failed', detail };
    }

    activateVoiceTransport(transport);

    try {
      await transport.connect({
        token,
        mode: 'voice',
        resumeHandle: liveSession.resumptionHandle,
      });

      if (!isCurrentSessionOperation(operationId)) {
        return { status: 'failed', detail: 'Voice session resumption was superseded' };
      }

      recordSessionEvent({ type: 'session.ready' });
      return { status: 'resumed' };
    } catch (error) {
      const detail = asErrorDetail(error, 'Failed to resume voice session');
      await invalidatePersistedLiveSession({
        restorable: false,
        invalidatedAt: new Date().toISOString(),
        invalidationReason: detail,
      });
      await endPersistedLiveSession({
        status: 'failed',
        endedReason: detail,
      });
      setVoiceResumptionInFlight(false);
      store.getState().setVoiceSessionResumption({
        status: 'resumeFailed',
        latestHandle: liveSession.resumptionHandle,
        resumable: false,
        lastDetail: detail,
      });
      reportDiagnostic({
        scope: 'voice-session',
        name: 'restore attempt failed',
        level: 'error',
        detail,
        data: {
          liveSessionId: liveSession.id,
        },
      });
      return { status: 'failed', detail };
    }
  };

  const connectFallbackSession = async (
    operationId: number,
    token: CreateEphemeralTokenResponse,
    reason: 'no-restore-candidate' | 'resume-failed',
    previousDetail: string | null = null,
  ): Promise<FallbackAttemptResult> => {
    return connectFallbackVoiceSession({
      operationId,
      token,
      reason,
      previousDetail,
      emitDiagnostic: reportDiagnostic,
      buildRehydrationPacketFromCurrentChat,
      isCurrentSessionOperation,
      resolveSessionVoice,
      transportAdapter: {
        create: (options) => createTransport(options),
      },
      createPersistedLiveSession,
      activateVoiceTransport,
      setVoiceResumptionInFlight,
      recordSessionEvent,
    });
  };

  return {
    connectFallbackSession,
    connectRestoredSession,
  };
}
