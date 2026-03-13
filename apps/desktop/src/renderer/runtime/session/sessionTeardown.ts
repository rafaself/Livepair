import { LIVE_ADAPTER_KEY } from '../transport/liveConfig';
import { isSpeechLifecycleActive } from '../speech/speechSessionLifecycle';
import { isSessionActiveLifecycle } from '../text/textSessionLifecycle';
import type { SessionStoreApi } from '../core/sessionControllerTypes';
import type { TextSessionStatus } from '../text/text.types';

type SessionControllerTeardownArgs = {
  store: SessionStoreApi;
  currentSpeechLifecycleStatus: () => ReturnType<SessionStoreApi['getState']>['speechLifecycle']['status'];
  currentTextSessionStatus: () => TextSessionStatus;
  applySpeechLifecycleEvent: (event: { type: string }) => void;
  clearToken: () => void;
  clearCurrentVoiceTranscript: () => void;
  cleanupTransport: () => void;
  getActiveTransport: () => { kind: string; disconnect: () => Promise<void> } | null;
  getVoiceCapture: () => { stop: () => Promise<void> };
  hasActiveTextStream: () => boolean;
  hasScreenCapture: () => boolean;
  hasTextRuntimeActivity: () => boolean;
  hasVoiceCapture: () => boolean;
  hasVoicePlayback: () => boolean;
  resetRuntimeState: (
    textSessionStatus?: TextSessionStatus,
    options?: { preserveConversationTurns?: boolean },
  ) => void;
  resetVoiceSessionDurability: () => void;
  resetVoiceSessionResumption: () => void;
  resetVoiceToolState: () => void;
  setVoiceCaptureState: (state: 'stopped' | 'idle') => void;
  setVoicePlaybackState: (state: 'stopped') => void;
  setVoiceResumptionInFlight: (value: boolean) => void;
  setVoiceSessionDurability: (value: ReturnType<SessionStoreApi['getState']>['voiceSessionDurability']) => void;
  setVoiceSessionResumption: (value: ReturnType<SessionStoreApi['getState']>['voiceSessionResumption']) => void;
  setVoiceSessionStatus: (status: 'disconnected' | 'stopping') => void;
  setVoiceToolStateSnapshot: (value: ReturnType<SessionStoreApi['getState']>['voiceToolState']) => void;
  stopScreenCaptureInternal: () => Promise<void>;
  stopVoiceCapture: () => Promise<void>;
  stopVoicePlayback: () => Promise<void>;
  textDisconnectRequested: () => void;
};

export function createSessionControllerTeardown({
  store,
  currentSpeechLifecycleStatus,
  currentTextSessionStatus,
  applySpeechLifecycleEvent,
  clearToken,
  clearCurrentVoiceTranscript,
  cleanupTransport,
  getActiveTransport,
  getVoiceCapture,
  hasActiveTextStream,
  hasScreenCapture,
  hasTextRuntimeActivity,
  hasVoiceCapture,
  hasVoicePlayback,
  resetRuntimeState,
  resetVoiceSessionDurability,
  resetVoiceSessionResumption,
  resetVoiceToolState,
  setVoiceCaptureState,
  setVoicePlaybackState,
  setVoiceResumptionInFlight,
  setVoiceSessionDurability,
  setVoiceSessionResumption,
  setVoiceSessionStatus,
  setVoiceToolStateSnapshot,
  stopScreenCaptureInternal,
  stopVoiceCapture,
  stopVoicePlayback,
  textDisconnectRequested,
}: SessionControllerTeardownArgs) {
  const hasSpeechRuntimeActivity = (): boolean => {
    const sessionStore = store.getState();

    return (
      isSpeechLifecycleActive(sessionStore.speechLifecycle.status) ||
      (
        sessionStore.voiceSessionStatus !== 'disconnected' &&
        sessionStore.voiceSessionStatus !== 'error'
      ) ||
      (
        sessionStore.voiceCaptureState !== 'idle' &&
        sessionStore.voiceCaptureState !== 'stopped' &&
        sessionStore.voiceCaptureState !== 'error'
      ) ||
      (
        sessionStore.voicePlaybackState !== 'idle' &&
        sessionStore.voicePlaybackState !== 'stopped' &&
        sessionStore.voicePlaybackState !== 'error'
      ) ||
      (
        sessionStore.screenCaptureState !== 'disabled' &&
        sessionStore.screenCaptureState !== 'error'
      ) ||
      getActiveTransport()?.kind === LIVE_ADAPTER_KEY
    );
  };

  const teardownActiveRuntime = async (
    {
      textSessionStatus = 'disconnected',
      preserveLastRuntimeError = null,
      preserveVoiceRuntimeDiagnostics = false,
      preserveConversationTurns = false,
    }: {
      textSessionStatus?: TextSessionStatus;
      preserveLastRuntimeError?: string | null;
      preserveVoiceRuntimeDiagnostics?: boolean;
      preserveConversationTurns?: boolean;
    } = {},
  ): Promise<void> => {
    const sessionStore = store.getState();
    const preservedVoiceSessionResumption = preserveVoiceRuntimeDiagnostics
      ? sessionStore.voiceSessionResumption
      : null;
    const preservedVoiceSessionDurability = preserveVoiceRuntimeDiagnostics
      ? sessionStore.voiceSessionDurability
      : null;
    const preservedVoiceToolState = preserveVoiceRuntimeDiagnostics
      ? sessionStore.voiceToolState
      : null;
    const hasActiveRuntime =
      getActiveTransport() !== null ||
      hasActiveTextStream() ||
      hasVoiceCapture() ||
      hasVoicePlayback() ||
      hasScreenCapture() ||
      hasSpeechRuntimeActivity() ||
      hasTextRuntimeActivity();

    if (!hasActiveRuntime) {
      if (isSpeechLifecycleActive(currentSpeechLifecycleStatus())) {
        applySpeechLifecycleEvent({ type: 'session.end.requested' });
        applySpeechLifecycleEvent({ type: 'session.ended' });
      }
      resetRuntimeState(textSessionStatus, { preserveConversationTurns });
      setVoiceSessionStatus('disconnected');
      sessionStore.setAssistantActivity('idle');
      clearToken();
      setVoiceResumptionInFlight(false);
      if (preserveVoiceRuntimeDiagnostics) {
        if (preservedVoiceSessionResumption) {
          setVoiceSessionResumption(preservedVoiceSessionResumption);
        }
        if (preservedVoiceSessionDurability) {
          setVoiceSessionDurability(preservedVoiceSessionDurability);
        }
        if (preservedVoiceToolState) {
          setVoiceToolStateSnapshot(preservedVoiceToolState);
        }
      } else {
        resetVoiceSessionResumption();
        resetVoiceSessionDurability();
        resetVoiceToolState();
      }
      clearCurrentVoiceTranscript();
      if (preserveLastRuntimeError !== null) {
        sessionStore.setLastRuntimeError(preserveLastRuntimeError);
      }
      return;
    }

    if (hasActiveTextStream() || isSessionActiveLifecycle(currentTextSessionStatus())) {
      textDisconnectRequested();
    }

    if (hasSpeechRuntimeActivity()) {
      applySpeechLifecycleEvent({ type: 'session.end.requested' });
      setVoiceSessionStatus('stopping');
    }

    try {
      if (
        hasVoiceCapture() &&
        (
          sessionStore.voiceCaptureState === 'capturing' ||
          sessionStore.voiceCaptureState === 'requestingPermission' ||
          sessionStore.voiceCaptureState === 'stopping'
        )
      ) {
        await stopVoiceCapture();
        await getVoiceCapture().stop();
      }

      await stopScreenCaptureInternal();
      await getActiveTransport()?.disconnect();
      await stopVoicePlayback();
    } finally {
      applySpeechLifecycleEvent({ type: 'session.ended' });
      cleanupTransport();
      resetRuntimeState(textSessionStatus, { preserveConversationTurns });
      clearToken();
      setVoiceResumptionInFlight(false);
      if (preserveVoiceRuntimeDiagnostics) {
        if (preservedVoiceSessionResumption) {
          setVoiceSessionResumption(preservedVoiceSessionResumption);
        }
        if (preservedVoiceSessionDurability) {
          setVoiceSessionDurability(preservedVoiceSessionDurability);
        }
        if (preservedVoiceToolState) {
          setVoiceToolStateSnapshot(preservedVoiceToolState);
        }
      } else {
        resetVoiceSessionResumption();
        resetVoiceSessionDurability();
        resetVoiceToolState();
      }
      clearCurrentVoiceTranscript();
      setVoiceCaptureState(hasVoiceCapture() ? 'stopped' : 'idle');
      setVoicePlaybackState('stopped');
      setVoiceSessionStatus('disconnected');
      sessionStore.setAssistantActivity('idle');
      if (preserveLastRuntimeError !== null) {
        sessionStore.setLastRuntimeError(preserveLastRuntimeError);
      }
    }
  };

  return {
    hasSpeechRuntimeActivity,
    teardownActiveRuntime,
  };
}
