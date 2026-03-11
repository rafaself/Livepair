export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

export interface CreateEphemeralTokenRequest {
  sessionId?: string;
}

export interface CreateEphemeralTokenResponse {
  token: string;
  expireTime: string;
  newSessionExpireTime: string;
}

export type TextChatMessageRole = 'user' | 'assistant';

export interface TextChatMessage {
  role: TextChatMessageRole;
  content: string;
}

export interface TextChatRequest {
  messages: TextChatMessage[];
}

export type TextChatStreamEvent =
  | {
      type: 'text-delta';
      text: string;
    }
  | {
      type: 'completed';
    }
  | {
      type: 'error';
      detail: string;
    };
