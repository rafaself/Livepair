import type { SessionCommand } from '../core/sessionCommand.types';

/**
 * Callback invoked whenever a session command enters the dispatch pipeline.
 * Used for observability (logging, diagnostics) — not for control flow.
 */
export type SessionCommandSink = (command: SessionCommand) => void;

/**
 * Handler implementations for each session command.
 *
 * Each handler is responsible for executing a single command type.
 * The dispatcher records the command for observability, then delegates
 * to the appropriate handler.
 */
type SessionCommandHandlers = {
  startSession: (options: { mode: 'speech' }) => Promise<void>;
  endSession: () => Promise<void>;
  endSpeechMode: () => Promise<void>;
  checkBackendHealth: () => Promise<void>;
  startVoiceCapture: () => Promise<void>;
  stopVoiceCapture: () => Promise<void>;
  startScreenCapture: () => Promise<void>;
  stopScreenCapture: () => Promise<void>;
  analyzeScreenNow: () => void;
  submitTextTurn: (text: string) => Promise<boolean>;
};

type SessionCommandDispatcherDeps = {
  onCommand: SessionCommandSink;
  handlers: SessionCommandHandlers;
};

/**
 * Creates the session command dispatcher.
 *
 * The dispatcher is the single internal routing point through which all
 * public-API session commands pass. Each method:
 *   1. Records the typed command for observability.
 *   2. Delegates to the corresponding handler.
 *
 * Return types match the public API contract so the caller can delegate
 * directly without casting.
 *
 * @internal Introduced in SR-04.
 */
export function createSessionCommandDispatcher({
  onCommand,
  handlers,
}: SessionCommandDispatcherDeps) {
  return {
    startSession: async (options: { mode: 'speech' }): Promise<void> => {
      onCommand({ type: 'session.start', mode: options.mode });
      await handlers.startSession(options);
    },
    endSession: async (): Promise<void> => {
      onCommand({ type: 'session.end' });
      await handlers.endSession();
    },
    endSpeechMode: async (): Promise<void> => {
      onCommand({ type: 'speechMode.end' });
      await handlers.endSpeechMode();
    },
    checkBackendHealth: async (): Promise<void> => {
      onCommand({ type: 'backend.checkHealth' });
      await handlers.checkBackendHealth();
    },
    startVoiceCapture: async (): Promise<void> => {
      onCommand({ type: 'voiceCapture.start' });
      await handlers.startVoiceCapture();
    },
    stopVoiceCapture: async (): Promise<void> => {
      onCommand({ type: 'voiceCapture.stop' });
      await handlers.stopVoiceCapture();
    },
    startScreenCapture: async (): Promise<void> => {
      onCommand({ type: 'screenCapture.start' });
      await handlers.startScreenCapture();
    },
    stopScreenCapture: async (): Promise<void> => {
      onCommand({ type: 'screenCapture.stop' });
      await handlers.stopScreenCapture();
    },
    analyzeScreenNow: (): void => {
      onCommand({ type: 'screenCapture.analyzeNow' });
      handlers.analyzeScreenNow();
    },
    submitTextTurn: async (text: string): Promise<boolean> => {
      onCommand({ type: 'textTurn.submit', text });
      return handlers.submitTextTurn(text);
    },
  };
}
