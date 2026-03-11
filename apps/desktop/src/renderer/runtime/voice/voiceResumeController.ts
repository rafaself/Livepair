import type {
  DesktopSession,
  LiveSessionEvent,
  TransportKind,
} from '../transport/transport.types';
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

export type VoiceResumeControllerOps = {
  store: SessionStoreApi;
  createTransport: (kind: TransportKind) => DesktopSession;
  getToken: () => CreateEphemeralTokenResponse | null;
  beginSessionOperation: () => number;
  isCurrentSessionOperation: (id: number) => boolean;
  setVoiceSessionStatus: (s: VoiceSessionStatus) => void;
  setVoiceSessionResumption: (p: Partial<VoiceSessionResumptionState>) => void;
  setVoiceSessionDurability: (p: Partial<VoiceSessionDurabilityState>) => void;
  setVoiceErrorState: (detail: string) => void;
  setVoiceResumptionInFlight: (v: boolean) => void;
  refreshToken: (operationId: number, detail: string) => Promise<CreateEphemeralTokenResponse | null>;
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
  const resume = async (detail: string): Promise<void> => {
    const store = ops.store.getState();
    const resumeHandle = store.voiceSessionResumption.latestHandle;
    let tokenToUse: CreateEphemeralTokenResponse | null = ops.getToken();

    if (!resumeHandle || !store.voiceSessionResumption.resumable) {
      ops.setVoiceSessionResumption({
        status: 'resumeFailed',
        lastDetail: detail,
      });
      ops.setVoiceSessionDurability({
        tokenValid: isTokenValidForReconnect(ops.getToken()),
        lastDetail: detail,
      });
      ops.setVoiceErrorState(detail);
      return;
    }

    const operationId = ops.beginSessionOperation();
    const previousTransport = ops.getActiveTransport();

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

    try {
      await ops.stopVoicePlayback();
    } catch {
      // Ignore playback teardown errors while replacing the transport.
    }

    void previousTransport?.disconnect().catch(() => undefined);

    if (!isTokenValidForReconnect(tokenToUse)) {
      tokenToUse = await ops.refreshToken(operationId, detail);

      if (!tokenToUse || !ops.isCurrentSessionOperation(operationId)) {
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
        resumeHandle,
      });

      if (!ops.isCurrentSessionOperation(operationId)) {
        void transport.disconnect().catch(() => undefined);
      }
    } catch (error) {
      if (!ops.isCurrentSessionOperation(operationId)) {
        return;
      }

      const resumeDetail = asErrorDetail(error, 'Failed to resume voice session');
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
      ops.setVoiceResumptionInFlight(false);
      ops.setVoiceErrorState(resumeDetail);
    }
  };

  return { resume };
}
