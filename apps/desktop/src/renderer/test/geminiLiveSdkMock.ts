import { vi } from 'vitest';
import type {
  ConnectGeminiLiveSdkSessionOptions,
  GeminiLiveSdkServerMessage,
  GeminiLiveSdkSession,
} from '../runtime/geminiLiveSdkClient';
import { setGeminiLiveSdkSessionConnectorForTests } from '../runtime/geminiLiveSdkClient';

function createCloseEvent(code?: number, reason?: string): CloseEvent {
  const init: CloseEventInit = {};

  if (code !== undefined) {
    init.code = code;
  }

  if (reason !== undefined) {
    init.reason = reason;
  }

  return new CloseEvent('close', init);
}

let lastConnectOptions: ConnectGeminiLiveSdkSessionOptions | undefined;
let callbacks: ConnectGeminiLiveSdkSessionOptions['callbacks'] | null = null;
let currentSession = createSession();

function createSession(): GeminiLiveSdkSession {
  return {
    sendClientContent: vi.fn(),
    sendRealtimeInput: vi.fn(),
    close: vi.fn(() => {
      callbacks?.onClose?.(createCloseEvent(1000, 'Client ended session'));
    }),
  };
}

export async function connectGeminiLiveSdkSession(
  options: ConnectGeminiLiveSdkSessionOptions,
): Promise<GeminiLiveSdkSession> {
  lastConnectOptions = options;
  callbacks = options.callbacks;
  return currentSession;
}

export function __resetGeminiLiveSdkMock(): void {
  lastConnectOptions = undefined;
  callbacks = null;
  currentSession = createSession();
  setGeminiLiveSdkSessionConnectorForTests(connectGeminiLiveSdkSession);
}

export function __emitGeminiLiveSdkOpen(): void {
  callbacks?.onOpen?.();
}

export function __emitGeminiLiveSdkMessage(message: GeminiLiveSdkServerMessage): void {
  callbacks?.onMessage(message);
}

export function __emitGeminiLiveSdkError(detail = 'Gemini Live connection failed'): void {
  callbacks?.onError?.(
    new ErrorEvent('error', {
      message: detail,
      error: new Error(detail),
    }),
  );
}

export function __emitGeminiLiveSdkClose(
  reason = 'Gemini Live session closed unexpectedly',
  code = 1011,
): void {
  callbacks?.onClose?.(createCloseEvent(code, reason));
}

export function __getLastGeminiLiveSdkConnectOptions():
  | ConnectGeminiLiveSdkSessionOptions
  | undefined {
  return lastConnectOptions;
}

export function __getLastGeminiLiveSdkSession(): GeminiLiveSdkSession {
  return currentSession;
}

__resetGeminiLiveSdkMock();
