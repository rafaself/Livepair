import type { RuntimeLogger, SessionEvent, TransportEvent } from './types';

export const NOOP_RUNTIME_LOGGER: RuntimeLogger = {
  onSessionEvent: () => undefined,
  onTransportEvent: () => undefined,
};

function logSessionEvent(event: SessionEvent): void {
  console.debug('[runtime:session]', event.type, event);
}

function logTransportEvent(event: TransportEvent): void {
  console.debug('[runtime:transport]', event.type, event);
}

export function createRuntimeLogger({
  enableConsole = import.meta.env.DEV || import.meta.env.MODE === 'test',
}: {
  enableConsole?: boolean;
} = {}): RuntimeLogger {
  if (!enableConsole) {
    return NOOP_RUNTIME_LOGGER;
  }

  return {
    onSessionEvent: logSessionEvent,
    onTransportEvent: logTransportEvent,
  };
}

export const defaultRuntimeLogger = createRuntimeLogger();
