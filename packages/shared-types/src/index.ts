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

export type LiveSessionId = string;

export type LiveSessionStatus = 'active' | 'ended' | 'failed';

export interface LiveSessionRecord {
  id: LiveSessionId;
  chatId: ChatId;
  startedAt: string;
  endedAt: string | null;
  status: LiveSessionStatus;
  endedReason: string | null;
  latestResumeHandle: string | null;
  resumable: boolean;
}

export interface CreateLiveSessionRequest {
  chatId: ChatId;
  startedAt?: string;
}

export interface UpdateLiveSessionRequest {
  id: LiveSessionId;
  latestResumeHandle?: string | null;
  resumable?: boolean;
}

export interface EndLiveSessionRequest {
  id: LiveSessionId;
  endedAt?: string;
  status: Extract<LiveSessionStatus, 'ended' | 'failed'>;
  endedReason?: string | null;
}

export interface CreateEphemeralTokenRequest {
  sessionId?: string;
}

export interface CreateEphemeralTokenResponse {
  token: string;
  expireTime: string;
  newSessionExpireTime: string;
}
