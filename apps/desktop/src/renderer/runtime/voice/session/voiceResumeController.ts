import type {
  DesktopSession,
  LiveSessionEvent,
} from '../../transport/transport.types';
import type { VoiceFallbackAttemptResult } from './connectFallbackVoiceSession';
import type {
  VoiceSessionDurabilityState,
  VoiceSessionResumptionState,
  VoiceSessionStatus,
} from '../voice.types';
import type { CreateEphemeralTokenResponse } from '@livepair/shared-types';
import { asErrorDetail } from '../../core/runtimeUtils';
import { isTokenValidForReconnect } from './voiceSessionToken';
import type { LiveTransportAdapter } from '../../transport/liveTransportAdapter';
import type { SessionStoreApi } from '../../core/sessionControllerTypes';
import { createVoiceResumeFallbackController } from './voiceResumeFallback';
import { teardownVoiceSessionForResume } from './voiceResumeTeardown';
import type { LiveRuntimeDiagnosticEvent } from '../../session/liveRuntimeObservability';

export type VoiceResumeControllerOps = {
  store: SessionStoreApi;
  transportAdapter?: LiveTransportAdapter;
  createTransport?: (kind: 'gemini-live') => DesktopSession;
  getToken: () => CreateEphemeralTokenResponse | null;
  beginSessionOperation: () => number;
  isCurrentSessionOperation: (id: number) => boolean;
  emitDiagnostic?: (event: LiveRuntimeDiagnosticEvent) => void;
  logRuntimeDiagnostic?: (
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
  onResumeConnected: () => void;
  getActiveTransport: () => DesktopSession | null;
  setActiveTransport: (t: DesktopSession | null) => void;
  unsubscribePreviousTransport: () => void;
  resetTransportDeps: () => void;
};

function describeUnavailableResume(
  detail: string,
  reason: 'missing-handle' | 'non-resumable',
): string {
  return `${detail} (${reason === 'missing-handle' ? 'resume handle unavailable' : 'session marked non-resumable'})`;
}

function recordRecoveryTransition(
  ops: VoiceResumeControllerOps,
  transition:
    | 'resume-requested'
    | 'resume-skipped'
    | 'token-refresh-required'
    | 'resume-aborted'
    | 'resume-connect-resolved'
    | 'resume-connect-failed',
  detail: string,
): void {
  const store = ops.store.getState();
  store.setVoiceSessionRecoveryDiagnostics({
    transitionCount: store.voiceSessionRecoveryDiagnostics.transitionCount + 1,
    lastTransition: transition,
    lastTransitionAt: new Date().toISOString(),
    lastRecoveryDetail: detail,
  });
}

export function createVoiceResumeController(ops: VoiceResumeControllerOps) {
  const reportDiagnostic = (event: LiveRuntimeDiagnosticEvent): void => {
    if (ops.emitDiagnostic) {
      ops.emitDiagnostic(event);
      return;
    }

    ops.logRuntimeDiagnostic?.('voice-session', event.name, {
      ...(event.detail ? { detail: event.detail } : {}),
      ...event.data,
    });
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
    const fallbackController = createVoiceResumeFallbackController({
      ops,
      operationId,
      resumeHandle,
      getTokenToUse: () => tokenToUse,
    });

    if (resumeUnavailableDetail) {
      reportDiagnostic({
        scope: 'voice-session',
        name: 'resume skipped',
        data: {
          operationId,
          triggerDetail: detail,
          failureDetail: resumeUnavailableDetail,
          latestHandle: resumeHandle,
          resumable: store.voiceSessionResumption.resumable,
        },
      });
      recordRecoveryTransition(ops, 'resume-skipped', resumeUnavailableDetail);
    }

    reportDiagnostic({
      scope: 'voice-session',
      name: 'resume requested',
      data: {
        operationId,
        detail,
        latestHandle: resumeHandle,
        resumable: store.voiceSessionResumption.resumable,
        tokenValid: isTokenValidForReconnect(tokenToUse),
      },
    });
    recordRecoveryTransition(ops, 'resume-requested', detail);

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

    await teardownVoiceSessionForResume(ops, previousTransport);

    if (!isTokenValidForReconnect(tokenToUse)) {
      reportDiagnostic({
        scope: 'voice-session',
        name: 'resume requires token refresh',
        data: {
          operationId,
          detail,
          latestHandle: resumeHandle,
        },
      });
      recordRecoveryTransition(ops, 'token-refresh-required', detail);
      tokenToUse = await ops.refreshToken(operationId, detail);

      if (!tokenToUse || !ops.isCurrentSessionOperation(operationId)) {
        reportDiagnostic({
          scope: 'voice-session',
          name: 'resume aborted after token refresh',
          data: {
            operationId,
            detail,
            tokenAvailable: tokenToUse !== null,
            isCurrentOperation: ops.isCurrentSessionOperation(operationId),
          },
        });
        if (ops.isCurrentSessionOperation(operationId)) {
          const failureDetail =
            ops.store.getState().voiceSessionDurability.lastDetail ?? detail;
          recordRecoveryTransition(ops, 'resume-aborted', failureDetail);
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
      await fallbackController.attemptFallback(resumeUnavailableDetail);
      return;
    }

    const activeResumeHandle = resumeHandle;
    if (activeResumeHandle === null) {
      fallbackController.finalizeFailedFallback(
        'Resume handle became unavailable before reconnect',
      );
      return;
    }

    const transport = ops.transportAdapter?.create() ?? ops.createTransport?.('gemini-live');

    if (!transport) {
      throw new Error('Voice transport adapter was unavailable for resume');
    }
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
      ops.onResumeConnected();
      recordRecoveryTransition(ops, 'resume-connect-resolved', detail);
      reportDiagnostic({
        scope: 'voice-session',
        name: 'resume connect resolved',
        data: {
          operationId,
          latestHandle: activeResumeHandle,
        },
      });

      if (!ops.isCurrentSessionOperation(operationId)) {
        void transport.disconnect().catch(() => undefined);
      }
    } catch (error) {
      if (!ops.isCurrentSessionOperation(operationId)) {
        return;
      }

      const resumeDetail = asErrorDetail(error, 'Failed to resume voice session');
      recordRecoveryTransition(ops, 'resume-connect-failed', resumeDetail);
      reportDiagnostic({
        scope: 'voice-session',
        name: 'resume connect failed',
        level: 'error',
        detail: resumeDetail,
        data: {
          operationId,
          latestHandle: activeResumeHandle,
        },
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
      await fallbackController.attemptFallback(resumeDetail);
    }
  };

  return { resume };
}
