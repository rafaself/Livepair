import type { DesktopSession } from '../transport/transport.types';

type TransportEventListener = Parameters<DesktopSession['subscribe']>[0];

type SessionTransportActivationArgs = {
  cleanupTransport: () => void;
  setActiveTransport: (transport: DesktopSession) => void;
  subscribeTransport: (
    transport: DesktopSession,
    listener: TransportEventListener,
  ) => void;
};

export function createSessionTransportActivation({
  cleanupTransport,
  setActiveTransport,
  subscribeTransport,
}: SessionTransportActivationArgs) {
  return {
    activateTransport: (
      transport: DesktopSession,
      listener: TransportEventListener,
    ): void => {
      cleanupTransport();
      setActiveTransport(transport);
      subscribeTransport(transport, listener);
    },
  };
}
