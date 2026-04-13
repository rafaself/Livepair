import type { LiveSessionEvent } from '../transport/transport.types';
import type { RuntimeLogger, SessionEvent } from './session.types';

export const NOOP_RUNTIME_LOGGER: RuntimeLogger = {
  onSessionEvent: () => undefined,
  onTransportEvent: () => undefined,
};

type RuntimeLoggingConfiguration = {
  isConsoleLoggingEnabled: () => boolean;
  isVerboseLoggingEnabled: () => boolean;
  defaultConsoleLoggingEnabled: boolean;
};

const DEFAULT_RUNTIME_LOGGING_CONFIGURATION: RuntimeLoggingConfiguration = {
  isConsoleLoggingEnabled: () => false,
  isVerboseLoggingEnabled: () => false,
  defaultConsoleLoggingEnabled: false,
};

let runtimeLoggingConfiguration = DEFAULT_RUNTIME_LOGGING_CONFIGURATION;

export function configureRuntimeLogging(
  configuration: Partial<RuntimeLoggingConfiguration>,
): void {
  runtimeLoggingConfiguration = {
    ...runtimeLoggingConfiguration,
    ...configuration,
  };
}

function isConsoleLoggingEnabled(): boolean {
  return runtimeLoggingConfiguration.isConsoleLoggingEnabled();
}

function isVerboseLoggingEnabled(): boolean {
  return runtimeLoggingConfiguration.isVerboseLoggingEnabled();
}

function serialize(value: unknown): string {
  try {
    return JSON.stringify(
      value,
      (_key, currentValue) => {
        if (currentValue instanceof Uint8Array) {
          return {
            type: 'Uint8Array',
            byteLength: currentValue.byteLength,
          };
        }

        return currentValue;
      },
      2,
    );
  } catch {
    return String(value);
  }
}

function logSessionEvent(event: SessionEvent): void {
  if (!isConsoleLoggingEnabled()) {
    return;
  }

  if ('detail' in event && event.type.endsWith('failed')) {
    console.error('[runtime:session]', event.type, serialize(event));
    return;
  }

  console.info('[runtime:session]', event.type, serialize(event));
}

function logTransportEvent(event: LiveSessionEvent): void {
  if (!isConsoleLoggingEnabled()) {
    return;
  }

  if (event.type === 'error') {
    console.error('[runtime:transport]', event.type, serialize(event));
    return;
  }

  if (event.type === 'go-away' || event.type === 'interrupted') {
    console.warn('[runtime:transport]', event.type, serialize(event));
    return;
  }

  console.info('[runtime:transport]', event.type, serialize(event));
}

export function logLifecycleTransition(
  previousStatus: string,
  nextStatus: string,
  eventType: string,
): void {
  if (!isVerboseLoggingEnabled()) {
    return;
  }

  console.info('[runtime:lifecycle]', `${previousStatus} -> ${nextStatus}`, serialize({
    eventType,
  }));
}

export function logRuntimeDiagnostic(
  scope: string,
  message: string,
  payload?: Record<string, unknown>,
): void {
  if (!isConsoleLoggingEnabled()) {
    return;
  }

  if (payload) {
    console.info(`[runtime:${scope}] ${message}`, serialize(payload));
    return;
  }

  console.info(`[runtime:${scope}] ${message}`);
}

export function logRuntimeError(
  scope: string,
  message: string,
  payload?: Record<string, unknown>,
): void {
  if (!isConsoleLoggingEnabled()) {
    return;
  }

  if (payload) {
    console.error(`[runtime:${scope}] ${message}`, serialize(payload));
    return;
  }

  console.error(`[runtime:${scope}] ${message}`);
}

export function createRuntimeLogger({
  enableConsole = runtimeLoggingConfiguration.defaultConsoleLoggingEnabled,
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
