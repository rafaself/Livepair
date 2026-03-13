import { asErrorDetail } from '../../core/runtimeUtils';
import type { DesktopSession } from '../../transport/transport.types';
import type {
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
  createTransport: () => DesktopSession;
  createPersistedLiveSession: () => Promise<void>;
  activateVoiceTransport: (transport: DesktopSession) => void;
  setVoiceResumptionInFlight: (value: boolean) => void;
  startVoiceCapture: () => Promise<boolean>;
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
  createTransport,
  createPersistedLiveSession,
  activateVoiceTransport,
  setVoiceResumptionInFlight,
  startVoiceCapture,
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

  let transport: DesktopSession;
  try {
    transport = createTransport();
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

  await createPersistedLiveSession();
  activateVoiceTransport(transport);
  setVoiceResumptionInFlight(false);

  try {
    await transport.connect({
      token,
      mode: 'voice',
      rehydrationPacket,
    });

    if (!isCurrentSessionOperation(operationId)) {
      return {
        status: 'failed',
        detail: 'Voice session fallback was superseded',
      };
    }

    const didStartVoiceCapture = await startVoiceCapture();

    if (!didStartVoiceCapture || !isCurrentSessionOperation(operationId)) {
      return {
        status: 'failed',
        detail: 'Failed to start voice capture after fallback session startup',
      };
    }

    applySpeechLifecycleEvent({ type: 'session.ready' });
    return { status: 'connected' };
  } catch (error) {
    return {
      status: 'failed',
      detail: asErrorDetail(error, 'Failed to connect voice session'),
    };
  }
}
