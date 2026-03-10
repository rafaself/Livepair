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

export type SessionPhase = 'idle' | 'starting' | 'active' | 'ending' | 'error';

export type AssistantActivityState = 'idle' | 'listening' | 'thinking' | 'speaking';

export type TransportConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'error';

export type TransportAssistantActivity = Exclude<AssistantActivityState, 'idle'> | 'ready';

export type RuntimeDebugEvent = {
  scope: 'session' | 'transport';
  type: string;
  at: string;
  detail?: string | undefined;
};

export type SessionEvent =
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

export type TransportEvent =
  | {
      type: 'transport.lifecycle';
      state: 'connecting' | 'connected' | 'disconnected' | 'error';
      detail?: string | undefined;
    }
  | {
      type: 'assistant.activity';
      activity: TransportAssistantActivity;
    }
  | {
      type: 'conversation.turn.appended';
      turn: ConversationTurnModel;
    }
  | {
      type: 'conversation.turn.updated';
      turnId: string;
      content: string;
      state: ConversationTurnState;
      statusLabel?: string | undefined;
    };

export type DesktopSessionTransportConnectParams = {
  token: CreateEphemeralTokenResponse;
};

export type DesktopSessionTransport = {
  kind: TransportKind;
  connect: (params: DesktopSessionTransportConnectParams) => Promise<void>;
  sendText: (text: string) => Promise<void>;
  disconnect: () => Promise<void>;
  subscribe: (listener: (event: TransportEvent) => void) => () => void;
};

export type RuntimeLogger = {
  onSessionEvent: (event: SessionEvent) => void;
  onTransportEvent: (event: TransportEvent) => void;
};
