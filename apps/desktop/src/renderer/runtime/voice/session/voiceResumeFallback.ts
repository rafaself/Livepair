import type { CreateEphemeralTokenResponse } from '@livepair/shared-types';
import { isTokenValidForReconnect } from './voiceSessionToken';
import type { VoiceResumeControllerOps } from './voiceResumeController';

type CreateVoiceResumeFallbackControllerOptions = {
  ops: VoiceResumeControllerOps;
  operationId: number;
  resumeHandle: string | null;
  getTokenToUse: () => CreateEphemeralTokenResponse | null;
};

export function createVoiceResumeFallbackController({
  ops,
  operationId,
  resumeHandle,
  getTokenToUse,
}: CreateVoiceResumeFallbackControllerOptions) {
  const finalizeFailedFallback = (failureDetail: string): void => {
    const tokenToUse = getTokenToUse();
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
    const tokenToUse = getTokenToUse();
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

    const fallbackResult = await ops.fallbackToNewSession(
      operationId,
      tokenToUse,
      failureDetail,
    );

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

  return {
    attemptFallback,
    finalizeFailedFallback,
  };
}
