export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

export type ChatId = string;

export interface ChatRecord {
  id: ChatId;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  isCurrent: boolean;
}

export type ChatMessageRole = 'user' | 'assistant';

export interface ChatMessageRecord {
  id: string;
  chatId: ChatId;
  role: ChatMessageRole;
  contentText: string;
  createdAt: string;
  sequence: number;
}

export interface CreateChatRequest {
  title?: string | null;
}

export interface AppendChatMessageRequest {
  chatId: ChatId;
  role: ChatMessageRole;
  contentText: string;
}

export interface CreateEphemeralTokenRequest {
  sessionId?: string;
}

export interface CreateEphemeralTokenResponse {
  token: string;
  expireTime: string;
  newSessionExpireTime: string;
}
