import { vi } from 'vitest';
import type {
  ConnectGeminiLiveSdkSessionOptions,
  GeminiLiveSdkServerMessage,
  GeminiLiveSdkSession,
} from '../runtime/transport/geminiLiveSdkClient';
import { setGeminiLiveSdkSessionConnectorForTests } from '../runtime/transport/geminiLiveSdkClient';

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

let callbacks: ConnectGeminiLiveSdkSessionOptions['callbacks'] | null = null;
let currentSession = createSession();

function createSession(): GeminiLiveSdkSession {
  return {
    sendClientContent: vi.fn(),
    sendRealtimeInput: vi.fn(),
    sendToolResponse: vi.fn(),
    close: vi.fn(() => {
      callbacks?.onClose?.(createCloseEvent(1000, 'Client ended session'));
    }),
  };
}

async function connectGeminiLiveSdkSession(
  options: ConnectGeminiLiveSdkSessionOptions,
): Promise<GeminiLiveSdkSession> {
  callbacks = options.callbacks;
  return currentSession;
}

export function __resetGeminiLiveSdkMock(): void {
  callbacks = null;
  currentSession = createSession();
  setGeminiLiveSdkSessionConnectorForTests(connectGeminiLiveSdkSession);
}

export function __emitGeminiLiveSdkMessage(message: GeminiLiveSdkServerMessage): void {
  callbacks?.onMessage(message);
}

__resetGeminiLiveSdkMock();
