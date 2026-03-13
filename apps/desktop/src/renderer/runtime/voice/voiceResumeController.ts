import type {
  DesktopSession,
  LiveSessionEvent,
  TransportKind,
} from '../transport/transport.types';
import type { VoiceFallbackAttemptResult } from './connectFallbackVoiceSession';
import type {
  VoiceSessionDurabilityState,
  VoiceSessionResumptionState,
  VoiceSessionStatus,
} from './voice.types';
import type { CreateEphemeralTokenResponse } from '@livepair/shared-types';
import { asErrorDetail } from '../core/runtimeUtils';
import { isTokenValidForReconnect } from './voiceSessionToken';
import { LIVE_ADAPTER_KEY } from '../transport/liveConfig';
import type { SessionStoreApi } from '../core/sessionControllerTypes';

type VoiceResumeControllerOps = {
  store: SessionStoreApi;
  createTransport: (kind: TransportKind) => DesktopSession;
  getToken: () => CreateEphemeralTokenResponse | null;
  beginSessionOperation: () => number;
  isCurrentSessionOperation: (id: number) => boolean;
  logRuntimeDiagnostic: (
    scope: 'voice-session',
    message: string,
    detail: Record<string, unknown>,
  ) => void;
  setVoiceSessionStatus: (s: VoiceSessionStatus) => void;
  setVoiceSessionResumption: (p: Partial<VoiceSessionResumptionState>) => void;
  setVoiceSessionDurability: (p: Partial<VoiceSessionDurabilityState>) => void;
  setVoiceErrorState: (detail: string) => void;
  setVoiceResumptionInFlight: (v: boolean) => void;
  refreshToken: (operationId: number, detail: string) => Promise<CreateEphemeralTokenResponse | null>;
  fallbackToNewSession: (
    operationId: number,
    token: CreateEphemeralTokenResponse,
    detail: string,
  ) => Promise<VoiceFallbackAttemptResult>;
  stopScreenCapture: () => Promise<void>;
  stopVoicePlayback: () => Promise<void>;
  subscribeTransport: (
    transport: DesktopSession,
    handler: (e: LiveSessionEvent) => void,
  ) => void;
  handleTransportEvent: (e: LiveSessionEvent) => void;
  getActiveTransport: () => DesktopSession | null;
  setActiveTransport: (t: DesktopSession | null) => void;
  unsubscribePreviousTransport: () => void;
  resetTransportDeps: () => void;
};

export function createVoiceResumeController(ops: VoiceResumeControllerOps) {
  const describeUnavailableResume = (
    detail: string,
    reason: 'missing-handle' | 'non-resumable',
  ): string => {
    return `${detail} (${reason === 'missing-handle' ? 'resume handle unavailable' : 'session marked non-resumable'})`;
  };

  const resume = async (detail: string): Promise<void> => {
    const store = ops.store.getState();
    const resumeHandle = store.voiceSessionResumption.latestHandle;
    let tokenToUse: CreateEphemeralTokenResponse | null = ops.getToken();
    const resumeUnavailableDetail =
      !resumeHandle || !store.voiceSessionResumption.resumable
        ? describeUnavailableResume(
            detail,
            store.voiceSessionResumption.resumable ? 'missing-handle' : 'non-resumable',
          )
        : null;

    const operationId = ops.beginSessionOperation();
    const previousTransport = ops.getActiveTransport();
    const finalizeFailedFallback = (failureDetail: string): void => {
      ops.setVoiceSessionResumption({
        status: 'resumeFailed',
        latestHandle: resumeHandle,
        resumable: false,
        lastDetail: failureDetail,
      });
      ops.setVoiceSessionDurability({
        tokenValid: isTokenValidForReconnect(tokenToUse),
        tokenRefreshing: false,
        tokenRefreshFailed: false,
        lastDetail: failureDetail,
      });
      ops.setVoiceResumptionInFlight(false);
      ops.setVoiceErrorState(failureDetail);
    };
    const attemptFallback = async (failureDetail: string): Promise<void> => {
      if (!tokenToUse) {
        finalizeFailedFallback('Voice session token was unavailable for fallback');
        return;
      }

      ops.setVoiceSessionResumption({
        latestHandle: resumeHandle,
        resumable: false,
        lastDetail: failureDetail,
      });
      ops.setVoiceSessionDurability({
        tokenValid: isTokenValidForReconnect(tokenToUse),
        tokenRefreshing: false,
        tokenRefreshFailed: false,
        lastDetail: failureDetail,
      });

      const fallbackResult = await ops.fallbackToNewSession(operationId, tokenToUse, failureDetail);

      if (!ops.isCurrentSessionOperation(operationId)) {
        return;
      }

      if (fallbackResult.status === 'connected') {
        return;
      }

      ops.logRuntimeDiagnostic('voice-session', 'fallback connect failed', {
        operationId,
        latestHandle: resumeHandle,
        detail: fallbackResult.detail,
      });
      finalizeFailedFallback(fallbackResult.detail);
    };

    if (resumeUnavailableDetail) {
      ops.logRuntimeDiagnostic('voice-session', 'resume skipped', {
        operationId,
        triggerDetail: detail,
        failureDetail: resumeUnavailableDetail,
        latestHandle: resumeHandle,
        resumable: store.voiceSessionResumption.resumable,
      });
    }

    ops.logRuntimeDiagnostic('voice-session', 'resume requested', {
      operationId,
      detail,
      latestHandle: resumeHandle,
      resumable: store.voiceSessionResumption.resumable,
      tokenValid: isTokenValidForReconnect(tokenToUse),
    });

    ops.setVoiceResumptionInFlight(true);
    ops.setVoiceSessionStatus('recovering');
    ops.setVoiceSessionResumption({
      status: 'reconnecting',
      lastDetail: detail,
    });
    ops.setVoiceSessionDurability({
      tokenValid: isTokenValidForReconnect(ops.getToken()),
      tokenRefreshing: false,
      tokenRefreshFailed: false,
      lastDetail: detail,
    });
    store.setLastRuntimeError(null);
    store.setActiveTransport(null);

    ops.unsubscribePreviousTransport();
    ops.setActiveTransport(null);
    ops.resetTransportDeps();

    await ops.stopScreenCapture();

    try {
      await ops.stopVoicePlayback();
    } catch {
      // Ignore playback teardown errors while replacing the transport.
    }

    void previousTransport?.disconnect().catch(() => undefined);

    if (!isTokenValidForReconnect(tokenToUse)) {
      ops.logRuntimeDiagnostic('voice-session', 'resume requires token refresh', {
        operationId,
        detail,
        latestHandle: resumeHandle,
      });
      tokenToUse = await ops.refreshToken(operationId, detail);

      if (!tokenToUse || !ops.isCurrentSessionOperation(operationId)) {
        ops.logRuntimeDiagnostic('voice-session', 'resume aborted after token refresh', {
          operationId,
          detail,
          tokenAvailable: tokenToUse !== null,
          isCurrentOperation: ops.isCurrentSessionOperation(operationId),
        });
        if (ops.isCurrentSessionOperation(operationId)) {
          const failureDetail =
            ops.store.getState().voiceSessionDurability.lastDetail ?? detail;
          ops.setVoiceSessionResumption({
            status: 'resumeFailed',
            lastDetail: failureDetail,
          });
          ops.setVoiceResumptionInFlight(false);
          ops.setVoiceErrorState(failureDetail);
        }
        return;
      }
    }

    if (resumeUnavailableDetail) {
      await attemptFallback(resumeUnavailableDetail);
      return;
    }

    const activeResumeHandle = resumeHandle;
    if (activeResumeHandle === null) {
      finalizeFailedFallback('Resume handle became unavailable before reconnect');
      return;
    }

    const transport = ops.createTransport(LIVE_ADAPTER_KEY);
    ops.setActiveTransport(transport);
    ops.subscribeTransport(transport, ops.handleTransportEvent);

    try {
      if (!tokenToUse) {
        throw new Error('Voice session token was unavailable for resume');
      }

      await transport.connect({
        token: tokenToUse,
        mode: 'voice',
        resumeHandle: activeResumeHandle,
      });
      ops.logRuntimeDiagnostic('voice-session', 'resume connect resolved', {
        operationId,
        latestHandle: activeResumeHandle,
      });

      if (!ops.isCurrentSessionOperation(operationId)) {
        void transport.disconnect().catch(() => undefined);
      }
    } catch (error) {
      if (!ops.isCurrentSessionOperation(operationId)) {
        return;
      }

      const resumeDetail = asErrorDetail(error, 'Failed to resume voice session');
      ops.logRuntimeDiagnostic('voice-session', 'resume connect failed', {
        operationId,
        latestHandle: activeResumeHandle,
        detail: resumeDetail,
      });
      ops.setVoiceSessionResumption({
        status: 'resumeFailed',
        lastDetail: resumeDetail,
      });
      ops.setVoiceSessionDurability({
        tokenValid: isTokenValidForReconnect(tokenToUse),
        tokenRefreshing: false,
        tokenRefreshFailed: false,
        lastDetail: resumeDetail,
      });
      await attemptFallback(resumeDetail);
    }
  };

  return { resume };
}
