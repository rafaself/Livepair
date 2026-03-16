import { asErrorDetail } from '../../core/runtimeUtils';
import type { DesktopSession } from '../../transport/transport.types';
import type {
  AssistantVoice,
  CreateEphemeralTokenResponse,
  RehydrationPacket,
} from '@livepair/shared-types';

type VoiceFallbackReason =
  | 'no-restore-candidate'
  | 'resume-failed'
  | 'resume-unavailable';

export type VoiceFallbackAttemptResult =
  | { status: 'connected' }
  | { status: 'failed'; detail: string };

type ConnectFallbackVoiceSessionArgs = {
  operationId: number;
  token: CreateEphemeralTokenResponse;
  reason: VoiceFallbackReason;
  previousDetail?: string | null;
  logRuntimeDiagnostic: (
    scope: 'voice-session',
    message: string,
    detail: Record<string, unknown>,
  ) => void;
  buildRehydrationPacketFromCurrentChat: () => Promise<RehydrationPacket>;
  isCurrentSessionOperation: (operationId: number) => boolean;
  resolveSessionVoice: () => Promise<AssistantVoice>;
  createTransport: (options?: { voice?: AssistantVoice }) => DesktopSession;
  createPersistedLiveSession: (voice: AssistantVoice) => Promise<void>;
  activateVoiceTransport: (transport: DesktopSession) => void;
  setVoiceResumptionInFlight: (value: boolean) => void;
  applySpeechLifecycleEvent: (event: { type: 'session.ready' }) => void;
};

export async function connectFallbackVoiceSession({
  operationId,
  token,
  reason,
  previousDetail = null,
  logRuntimeDiagnostic,
  buildRehydrationPacketFromCurrentChat,
  isCurrentSessionOperation,
  resolveSessionVoice,
  createTransport,
  createPersistedLiveSession,
  activateVoiceTransport,
  setVoiceResumptionInFlight,
  applySpeechLifecycleEvent,
}: ConnectFallbackVoiceSessionArgs): Promise<VoiceFallbackAttemptResult> {
  logRuntimeDiagnostic('voice-session', 'starting explicit fallback session', {
    reason,
    previousDetail,
  });

  let rehydrationPacket: RehydrationPacket;

  try {
    rehydrationPacket = await buildRehydrationPacketFromCurrentChat();
  } catch (error) {
    return {
      status: 'failed',
      detail: asErrorDetail(error, 'Failed to build rehydration context'),
    };
  }

  if (!isCurrentSessionOperation(operationId)) {
    return {
      status: 'failed',
      detail: 'Voice session fallback was superseded',
    };
  }

  let voice: AssistantVoice;
  try {
    voice = await resolveSessionVoice();
  } catch (error) {
    return {
      status: 'failed',
      detail: asErrorDetail(error, 'Failed to resolve session voice'),
    };
  }

  if (!isCurrentSessionOperation(operationId)) {
    return {
      status: 'failed',
      detail: 'Voice session fallback was superseded',
    };
  }

  let transport: DesktopSession;
  try {
    transport = createTransport({ voice });
  } catch (error) {
    return {
      status: 'failed',
      detail: asErrorDetail(error, 'Failed to prepare voice session'),
    };
  }

  if (!isCurrentSessionOperation(operationId)) {
    return {
      status: 'failed',
      detail: 'Voice session fallback was superseded',
    };
  }

  activateVoiceTransport(transport);
  setVoiceResumptionInFlight(false);
  let transportConnected = false;

  const disconnectConnectedTransport = async (detail: string): Promise<VoiceFallbackAttemptResult> => {
    try {
      await transport.disconnect();
      return {
        status: 'failed',
        detail,
      };
    } catch (disconnectError) {
      const disconnectDetail = asErrorDetail(disconnectError, 'Failed to disconnect voice session');
      logRuntimeDiagnostic('voice-session', 'fallback cleanup failed', {
        detail,
        disconnectDetail,
      });
      return {
        status: 'failed',
        detail: `${detail} Cleanup failed: ${disconnectDetail}`,
      };
    }
  };

  try {
    await transport.connect({
      token,
      mode: 'voice',
      rehydrationPacket,
    });
    transportConnected = true;

    if (!isCurrentSessionOperation(operationId)) {
      return disconnectConnectedTransport('Voice session fallback was superseded');
    }

    try {
      await createPersistedLiveSession(voice);
    } catch (error) {
      return disconnectConnectedTransport(asErrorDetail(error, 'Failed to create live session'));
    }

    applySpeechLifecycleEvent({ type: 'session.ready' });
    return { status: 'connected' };
  } catch (error) {
    if (transportConnected) {
      return disconnectConnectedTransport(asErrorDetail(error, 'Failed to connect voice session'));
    }

    return {
      status: 'failed',
      detail: asErrorDetail(error, 'Failed to connect voice session'),
    };
  }
}
