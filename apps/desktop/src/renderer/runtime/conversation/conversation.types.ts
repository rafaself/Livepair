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
  persistedMessageId?: string | undefined;
};

export type TranscriptArtifactModel = {
  id: string;
  role: Extract<ConversationRole, 'user' | 'assistant'>;
  content: string;
  timestamp: string;
  state?: Extract<ConversationTurnState, 'streaming' | 'complete'> | undefined;
  statusLabel?: string | undefined;
  source: 'voice';
  transcriptFinal?: boolean | undefined;
  attachedTurnId?: string | undefined;
};

export type ConversationTimelineEntry = ConversationTurnModel | TranscriptArtifactModel;
