type SessionControllerErrorHandlingArgs = {
  applySessionEvent: (event: { type: 'session.error'; detail: string }) => void;
  clearToken: () => void;
  cleanupTransport: () => void;
  endSessionInternal: (options: {
    preserveLastRuntimeError?: string | null;
    preserveVoiceRuntimeDiagnostics?: boolean;
    liveSessionEnd?: {
      status: 'ended' | 'failed';
      endedReason?: string | null;
    };
  }) => Promise<void>;
  emitDiagnostic?: (event: {
    scope: 'session' | 'voice-session';
    name: string;
    level?: 'info' | 'error';
    detail?: string | null;
    data?: Record<string, unknown>;
  }) => void;
  logRuntimeError?: (
    scope: 'session' | 'voice-session',
    message: string,
    detail?: Record<string, unknown>,
  ) => void;
  resetVoiceTurnTranscriptState: () => void;
  setLastRuntimeError: (detail: string) => void;
  setAssistantActivity: (activity: 'idle') => void;
  setActiveTransport: (transport: null) => void;
  setCurrentMode: (mode: 'inactive') => void;
  setVoiceResumptionInFlight: (value: boolean) => void;
  getVoiceSessionResumptionStatus: () => string;
  setVoiceSessionResumption: (patch: {
    status: 'resumeFailed';
    resumable: false;
    lastDetail: string;
  }) => void;
  setVoiceToolState: (patch: { status: 'toolError'; lastError: string }) => void;
  textRuntimeFailed: () => void;
  failPendingAssistantTurn: (statusLabel: string) => void;
};

export function createSessionControllerErrorHandling({
  applySessionEvent,
  clearToken,
  cleanupTransport,
  endSessionInternal,
  emitDiagnostic,
  logRuntimeError,
  resetVoiceTurnTranscriptState,
  setLastRuntimeError,
  setAssistantActivity,
  setActiveTransport,
  setCurrentMode,
  setVoiceResumptionInFlight,
  getVoiceSessionResumptionStatus,
  setVoiceSessionResumption,
  setVoiceToolState,
  textRuntimeFailed,
  failPendingAssistantTurn,
}: SessionControllerErrorHandlingArgs) {
  const reportDiagnostic = (event: {
    scope: 'session' | 'voice-session';
    name: string;
    level?: 'info' | 'error';
    detail?: string | null;
    data?: Record<string, unknown>;
  }): void => {
    if (emitDiagnostic) {
      emitDiagnostic(event);
      return;
    }

    logRuntimeError?.(event.scope, event.name, {
      ...(event.detail ? { detail: event.detail } : {}),
      ...event.data,
    });
  };

  const setErrorState = (
    detail: string,
    failedTurnStatusLabel = 'Disconnected',
  ): void => {
    textRuntimeFailed();
    reportDiagnostic({
      scope: 'session',
      name: 'runtime entered error state',
      level: 'error',
      detail,
    });
    failPendingAssistantTurn(failedTurnStatusLabel);
    cleanupTransport();
    setAssistantActivity('idle');
    setActiveTransport(null);
    setLastRuntimeError(detail);
  };

  const settleVoiceErrorState = async (detail: string): Promise<void> => {
    reportDiagnostic({
      scope: 'voice-session',
      name: 'runtime entered error state',
      level: 'error',
      detail,
    });
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

    applySessionEvent({ type: 'session.error', detail });
    setLastRuntimeError(detail);
    setCurrentMode('inactive');
    setVoiceToolState({
      status: 'toolError',
      lastError: detail,
    });
    await endSessionInternal({
      preserveLastRuntimeError: detail,
      preserveVoiceRuntimeDiagnostics: true,
      liveSessionEnd: {
        status: 'failed',
        endedReason: detail,
      },
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
