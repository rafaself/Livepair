type SessionControllerErrorHandlingArgs = {
  clearToken: () => void;
  cleanupTransport: () => void;
  endSessionInternal: (options: {
    preserveLastRuntimeError?: string | null;
    preserveVoiceRuntimeDiagnostics?: boolean;
  }) => Promise<void>;
  logRuntimeError: (
    scope: 'session' | 'voice-session',
    message: string,
    detail?: Record<string, unknown>,
  ) => void;
  resetVoiceTurnTranscriptState: () => void;
  setLastRuntimeError: (detail: string) => void;
  setAssistantActivity: (activity: 'idle') => void;
  setActiveTransport: (transport: null) => void;
  setCurrentMode: (mode: 'text') => void;
  setVoiceResumptionInFlight: (value: boolean) => void;
  getVoiceSessionResumptionStatus: () => string;
  setVoiceSessionResumption: (patch: {
    status: 'resumeFailed';
    resumable: false;
    lastDetail: string;
  }) => void;
  setVoiceSessionStatus: (status: 'error') => void;
  setVoiceToolState: (patch: { status: 'toolError'; lastError: string }) => void;
  textRuntimeFailed: () => void;
  failPendingAssistantTurn: (statusLabel: string) => void;
};

export function createSessionControllerErrorHandling({
  clearToken,
  cleanupTransport,
  endSessionInternal,
  logRuntimeError,
  resetVoiceTurnTranscriptState,
  setLastRuntimeError,
  setAssistantActivity,
  setActiveTransport,
  setCurrentMode,
  setVoiceResumptionInFlight,
  getVoiceSessionResumptionStatus,
  setVoiceSessionResumption,
  setVoiceSessionStatus,
  setVoiceToolState,
  textRuntimeFailed,
  failPendingAssistantTurn,
}: SessionControllerErrorHandlingArgs) {
  const setErrorState = (
    detail: string,
    failedTurnStatusLabel = 'Disconnected',
  ): void => {
    textRuntimeFailed();
    logRuntimeError('session', 'runtime entered error state', { detail });
    failPendingAssistantTurn(failedTurnStatusLabel);
    cleanupTransport();
    setAssistantActivity('idle');
    setActiveTransport(null);
    setLastRuntimeError(detail);
  };

  const settleVoiceErrorState = async (detail: string): Promise<void> => {
    logRuntimeError('voice-session', 'runtime entered error state', { detail });
    resetVoiceTurnTranscriptState();
    setVoiceResumptionInFlight(false);
    clearToken();

    if (getVoiceSessionResumptionStatus() !== 'idle') {
      setVoiceSessionResumption({
        status: 'resumeFailed',
        resumable: false,
        lastDetail: detail,
      });
    }

    setVoiceSessionStatus('error');
    setLastRuntimeError(detail);
    setCurrentMode('text');
    setVoiceToolState({
      status: 'toolError',
      lastError: detail,
    });
    await endSessionInternal({
      preserveLastRuntimeError: detail,
      preserveVoiceRuntimeDiagnostics: true,
    });
  };

  const setVoiceErrorState = (detail: string): void => {
    void settleVoiceErrorState(detail);
  };

  return {
    setErrorState,
    setVoiceErrorState,
    settleVoiceErrorState,
  };
}
