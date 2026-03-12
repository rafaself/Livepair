export type ConversationRole = 'user' | 'assistant' | 'system';

export type ConversationTurnState = 'streaming' | 'complete' | 'error';

export type ConversationTurnModel = {
  id: string;
  role: ConversationRole;
  content: string;
  timestamp: string;
  state?: ConversationTurnState | undefined;
  statusLabel?: string | undefined;
  source?: 'text' | 'voice' | undefined;
  transcriptFinal?: boolean | undefined;
};
