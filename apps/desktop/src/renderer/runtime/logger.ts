import { useUiStore } from '../store/uiStore';
import type { LiveSessionEvent, RuntimeLogger, SessionControllerEvent } from './types';

export const NOOP_RUNTIME_LOGGER: RuntimeLogger = {
  onSessionEvent: () => undefined,
  onTransportEvent: () => undefined,
};

function isConsoleLoggingEnabled(): boolean {
  return (
    import.meta.env.DEV ||
    import.meta.env.MODE === 'test' ||
    useUiStore.getState().isDebugMode
  );
}

function isVerboseLoggingEnabled(): boolean {
  return import.meta.env.MODE === 'test' || useUiStore.getState().isDebugMode;
}

function logSessionEvent(event: SessionControllerEvent): void {
  if (!isConsoleLoggingEnabled()) {
    return;
  }

  if ('detail' in event && event.type.endsWith('failed')) {
    console.error('[runtime:session]', event.type, event);
    return;
  }

  console.info('[runtime:session]', event.type, event);
}

function logTransportEvent(event: LiveSessionEvent): void {
  if (!isConsoleLoggingEnabled()) {
    return;
  }

  if (event.type === 'error') {
    console.error('[runtime:transport]', event.type, event);
    return;
  }

  if (event.type === 'go-away' || event.type === 'interrupted') {
    console.warn('[runtime:transport]', event.type, event);
    return;
  }

  console.info('[runtime:transport]', event.type, event);
}

export function logLifecycleTransition(
  previousStatus: string,
  nextStatus: string,
  eventType: string,
): void {
  if (!isVerboseLoggingEnabled()) {
    return;
  }

  console.info('[runtime:lifecycle]', `${previousStatus} -> ${nextStatus}`, {
    eventType,
  });
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
    console.info(`[runtime:${scope}] ${message}`, payload);
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
    console.error(`[runtime:${scope}] ${message}`, payload);
    return;
  }

  console.error(`[runtime:${scope}] ${message}`);
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
