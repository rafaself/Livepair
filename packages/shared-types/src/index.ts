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

export type RehydrationPacketTurnRole = ChatMessageRole;

export type RehydrationPacketTurnKind = 'message' | 'transcript';

export interface RehydrationPacketTurn {
  role: RehydrationPacketTurnRole;
  kind: RehydrationPacketTurnKind;
  text: string;
  createdAt: string;
  sequence: number;
}

export interface RehydrationPacketStateEntry {
  key: string;
  value: string;
}

export interface RehydrationPacketStateSection {
  entries: RehydrationPacketStateEntry[];
}

export interface RehydrationPacketContextState {
  task: RehydrationPacketStateSection;
  context: RehydrationPacketStateSection;
}

export interface RehydrationPacket {
  stableInstruction: string;
  summary: string | null;
  recentTurns: RehydrationPacketTurn[];
  contextState: RehydrationPacketContextState;
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
  resumptionHandle: string | null;
  lastResumptionUpdateAt: string | null;
  restorable: boolean;
  invalidatedAt: string | null;
  invalidationReason: string | null;
  summarySnapshot?: string | null;
  contextStateSnapshot?: RehydrationPacketContextState | null;
}

export interface CreateLiveSessionRequest {
  chatId: ChatId;
  startedAt?: string;
}

export interface UpdateLiveSessionRequest {
  id: LiveSessionId;
  resumptionHandle?: string | null;
  lastResumptionUpdateAt?: string | null;
  restorable?: boolean;
  invalidatedAt?: string | null;
  invalidationReason?: string | null;
  summarySnapshot?: string | null;
  contextStateSnapshot?: RehydrationPacketContextState | null;
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
