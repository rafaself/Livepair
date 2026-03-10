import type { CreateEphemeralTokenResponse } from '@livepair/shared-types';

export type ConversationRole = 'user' | 'assistant' | 'system';

export type ConversationTurnState = 'streaming' | 'complete' | 'error';

export type ConversationTurnModel = {
  id: string;
  role: ConversationRole;
  content: string;
  timestamp: string;
  state?: ConversationTurnState | undefined;
  statusLabel?: string | undefined;
};

export type TransportKind = 'gemini-live';
export type SessionMode = 'text' | 'voice';

export type SessionPhase = 'idle' | 'starting' | 'active' | 'ending' | 'error';
export type TextSessionStatus =
  | 'idle'
  | 'connecting'
  | 'ready'
  | 'sending'
  | 'receiving'
  | 'generationCompleted'
  | 'completed'
  | 'interrupted'
  | 'goAway'
  | 'disconnecting'
  | 'disconnected'
  | 'error';
export type TextSessionLifecycle = {
  status: TextSessionStatus;
};

export type AssistantActivityState = 'idle' | 'listening' | 'thinking' | 'speaking';

export type TransportConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'error';

export type RuntimeDebugEvent = {
  scope: 'session' | 'transport';
  type: string;
  at: string;
  detail?: string | undefined;
};

export type SessionControllerEvent =
  | { type: 'session.backend.health.started' }
  | { type: 'session.backend.health.succeeded' }
  | { type: 'session.backend.health.failed'; detail: string }
  | { type: 'session.start.requested'; transport: TransportKind }
  | { type: 'session.token.request.started' }
  | { type: 'session.token.request.succeeded'; transport: TransportKind }
  | { type: 'session.token.request.failed'; detail: string }
  | { type: 'session.end.requested' }
  | { type: 'session.ended' }
  | { type: 'session.debug.state.set'; detail: string };

export type SessionConnectionState = 'connecting' | 'connected' | 'disconnected';

export type LiveSessionEvent =
  | {
      type: 'connection-state-changed';
      state: SessionConnectionState;
    }
  | {
      type: 'text-delta';
      text: string;
    }
  | {
      type: 'text-message';
      text: string;
    }
  | {
      type: 'audio-chunk';
      chunk: Uint8Array;
    }
  | {
      type: 'input-transcript';
      text: string;
      isFinal?: boolean | undefined;
    }
  | {
      type: 'output-transcript';
      text: string;
      isFinal?: boolean | undefined;
    }
  | {
      type: 'interrupted';
    }
  | {
      type: 'generation-complete';
    }
  | {
      type: 'turn-complete';
    }
  | {
      type: 'go-away';
      detail?: string | undefined;
    }
  | {
      type: 'session-resumption-update';
      sessionId?: string | undefined;
      detail?: string | undefined;
    }
  | {
      type: 'error';
      detail: string;
    };

export type DesktopSessionConnectParams = {
  token: CreateEphemeralTokenResponse;
  mode: SessionMode;
};

export type DesktopSession = {
  kind: TransportKind;
  connect: (params: DesktopSessionConnectParams) => Promise<void>;
  sendText: (text: string) => Promise<void>;
  sendAudioChunk: (chunk: Uint8Array) => Promise<void>;
  disconnect: () => Promise<void>;
  subscribe: (listener: (event: LiveSessionEvent) => void) => () => void;
};

export type RuntimeLogger = {
  onSessionEvent: (event: SessionControllerEvent) => void;
  onTransportEvent: (event: LiveSessionEvent) => void;
};
