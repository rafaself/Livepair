import type { DesktopSession } from './transport/transport.types';

export function createSessionControllerMutableRuntime() {
  let activeTransport: DesktopSession | null = null;
  let unsubscribeTransport: (() => void) | null = null;
  let sessionOperationId = 0;
  let voiceResumptionInFlight = false;

  const beginSessionOperation = (): number => {
    sessionOperationId += 1;
    return sessionOperationId;
  };

  return {
    beginSessionOperation,
    clearTransportSubscription: (): void => {
      unsubscribeTransport?.();
      unsubscribeTransport = null;
    },
    getActiveTransport: (): DesktopSession | null => activeTransport,
    getVoiceResumptionInFlight: (): boolean => voiceResumptionInFlight,
    isCurrentSessionOperation: (operationId: number): boolean =>
      operationId === sessionOperationId,
    setActiveTransport: (transport: DesktopSession | null): void => {
      activeTransport = transport;
    },
    setVoiceResumptionInFlight: (value: boolean): void => {
      voiceResumptionInFlight = value;
    },
    subscribeTransport: (
      transport: DesktopSession,
      listener: Parameters<DesktopSession['subscribe']>[0],
    ): void => {
      unsubscribeTransport = transport.subscribe(listener);
    },
  };
}
