import type { SessionEvent } from '../core/session.types';
import type { TextSessionStatus } from '../text/text.types';

export type EndSessionInternalOptions = {
  preserveLastRuntimeError?: string | null;
  recordEvents?: boolean;
  preserveVoiceRuntimeDiagnostics?: boolean;
  liveSessionEnd?: {
    status: 'ended' | 'failed';
    endedReason?: string | null;
  };
};

export type EndSessionInternal = (options?: EndSessionInternalOptions) => Promise<void>;

type SessionControllerEndingsArgs = {
  beginSessionOperation: () => number;
  recordSessionEvent: (event: SessionEvent) => void;
  teardownActiveRuntime: (options: {
    textSessionStatus: TextSessionStatus;
    preserveLastRuntimeError?: string | null;
    preserveVoiceRuntimeDiagnostics?: boolean;
    preserveConversationTurns?: boolean;
  }) => Promise<void>;
  endLiveSession: (liveSessionEnd: {
    status: 'ended' | 'failed';
    endedReason?: string | null;
  }) => Promise<void>;
  setCurrentMode: (mode: 'inactive') => void;
};

export function createSessionControllerEndings({
  beginSessionOperation,
  recordSessionEvent,
  teardownActiveRuntime,
  endLiveSession,
  setCurrentMode,
}: SessionControllerEndingsArgs): {
  endSessionInternal: EndSessionInternal;
  endSpeechModeInternal: (options?: { recordEvents?: boolean }) => Promise<void>;
} {
  const endSessionInternal: EndSessionInternal = async (options = {}): Promise<void> => {
    const {
      preserveLastRuntimeError = null,
      recordEvents = false,
      preserveVoiceRuntimeDiagnostics = false,
      liveSessionEnd = {
        status: 'ended' as const,
        endedReason: null,
      },
    } = options;

    beginSessionOperation();

    if (recordEvents) {
      recordSessionEvent({ type: 'session.end.requested' });
    }

    await teardownActiveRuntime({
      textSessionStatus: 'disconnected',
      preserveLastRuntimeError,
      preserveVoiceRuntimeDiagnostics,
    });
    await endLiveSession(liveSessionEnd);
    setCurrentMode('inactive');

    if (recordEvents) {
      recordSessionEvent({ type: 'session.ended' });
    }
  };

  const endSpeechModeInternal = async (
    options: { recordEvents?: boolean } = {},
  ): Promise<void> => {
    const { recordEvents = false } = options;

    beginSessionOperation();

    if (recordEvents) {
      recordSessionEvent({ type: 'session.end.requested' });
    }

    await teardownActiveRuntime({
      textSessionStatus: 'disconnected',
      preserveConversationTurns: true,
    });
    await endLiveSession({
      status: 'ended',
      endedReason: null,
    });
    setCurrentMode('inactive');

    if (recordEvents) {
      recordSessionEvent({ type: 'session.ended' });
    }
  };

  return {
    endSessionInternal,
    endSpeechModeInternal,
  };
}
