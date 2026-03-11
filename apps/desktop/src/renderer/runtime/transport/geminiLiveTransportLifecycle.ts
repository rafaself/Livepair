import type { LiveSessionEvent } from './transport.types';
import type { GeminiLiveTransportState } from './geminiLiveTransportState';
import { getCloseReason, getErrorEventDetail } from './geminiLiveTransportProtocol';
import { resetGeminiLiveTransportState } from './geminiLiveTransportState';

type HandleGeminiLiveSdkErrorOptions = {
  state: GeminiLiveTransportState;
  failSetup: (detail: string) => void;
  handleUnexpectedTermination: (detail: string) => void;
  logError: (message: string, metadata?: Record<string, unknown>) => void;
};

type HandleGeminiLiveSdkCloseOptions = {
  state: GeminiLiveTransportState;
  failSetup: (detail: string) => void;
  handleUnexpectedTermination: (detail: string) => void;
  logDiagnostic: (message: string, metadata?: Record<string, unknown>) => void;
};

export function handleGeminiLiveUnexpectedTermination(
  state: GeminiLiveTransportState,
  emit: (event: LiveSessionEvent) => void,
  logDiagnostic: (message: string, metadata?: Record<string, unknown>) => void,
  detail: string,
): void {
  if (state.hasReceivedGoAway) {
    return;
  }

  resetGeminiLiveTransportState(state);
  logDiagnostic('connection terminated', {
    detail,
  });
  emit({ type: 'connection-terminated', detail });
}

export function handleGeminiLiveSdkError(
  { state, failSetup, handleUnexpectedTermination, logError }: HandleGeminiLiveSdkErrorOptions,
  event: ErrorEvent,
): void {
  const detail = getErrorEventDetail(event, 'Gemini Live connection failed');
  logError('sdk error', {
    detail,
    message: event.message || '(empty)',
    type: event.type,
  });

  if (!state.hasCompletedSetup) {
    failSetup(detail);
    return;
  }

  if (state.closingByClient) {
    return;
  }

  handleUnexpectedTermination(detail);
}

export function handleGeminiLiveSdkClose(
  { state, failSetup, handleUnexpectedTermination, logDiagnostic }: HandleGeminiLiveSdkCloseOptions,
  event: CloseEvent,
): void {
  const detail = getCloseReason(
    event,
    state.hasCompletedSetup
      ? 'Gemini Live session closed unexpectedly'
      : 'Gemini Live session closed before setup completed',
  );
  logDiagnostic('sdk close', {
    code: event.code,
    reason: event.reason || '(empty)',
    wasClean: event.wasClean,
    detail,
    closingByClient: state.closingByClient,
    hasCompletedSetup: state.hasCompletedSetup,
  });

  if (state.closingByClient) {
    const disconnectResolver = state.disconnectResolver;
    resetGeminiLiveTransportState(state, {
      hasReceivedGoAway: false,
      closingByClient: false,
      disconnectResolver: null,
    });
    disconnectResolver?.();
    return;
  }

  if (state.hasReceivedGoAway) {
    return;
  }

  if (!state.hasCompletedSetup) {
    failSetup(detail);
    return;
  }

  handleUnexpectedTermination(detail);
}
