import type { DesktopSession } from '../transport/transport.types';
import { createRealtimeOutboundGateway } from '../outbound/realtimeOutboundGateway';
import type { RealtimeOutboundGateway } from '../outbound/outbound.types';

export function createSessionControllerMutableRuntime() {
  let activeTransport: DesktopSession | null = null;
  const realtimeOutboundGateway = createRealtimeOutboundGateway();
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
    getRealtimeOutboundGateway: (): RealtimeOutboundGateway =>
      realtimeOutboundGateway,
    getVoiceResumptionInFlight: (): boolean => voiceResumptionInFlight,
    isCurrentSessionOperation: (operationId: number): boolean =>
      operationId === sessionOperationId,
    resetRealtimeOutboundGateway: (): void => {
      realtimeOutboundGateway.reset();
    },
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
