import type { AnswerMetadata } from '@livepair/shared-types';

export type ConversationRole = 'user' | 'assistant' | 'system';

export type ConversationTurnState = 'streaming' | 'complete' | 'error';

export type ConversationTurnModel = {
  kind?: 'turn';
  id: string;
  role: ConversationRole;
  content: string;
  timestamp: string;
  timelineOrdinal?: number | undefined;
  liveTurnId?: string | undefined;
  state?: ConversationTurnState | undefined;
  statusLabel?: string | undefined;
  source?: 'text' | 'voice' | undefined;
  transcriptFinal?: boolean | undefined;
  answerMetadata?: AnswerMetadata | undefined;
  persistedMessageId?: string | undefined;
};

export type TranscriptArtifactModel = {
  kind: 'transcript';
  id: string;
  role: Extract<ConversationRole, 'user' | 'assistant'>;
  content: string;
  timestamp: string;
  timelineOrdinal?: number | undefined;
  liveTurnId?: string | undefined;
  state?: Extract<ConversationTurnState, 'streaming' | 'complete'> | undefined;
  statusLabel?: string | undefined;
  source: 'voice';
  transcriptFinal?: boolean | undefined;
  attachedTurnId?: string | undefined;
};

export type ConversationTimelineEntry = ConversationTurnModel | TranscriptArtifactModel;

export function isTranscriptArtifact(
  entry: ConversationTimelineEntry,
): entry is TranscriptArtifactModel {
  return entry.kind === 'transcript';
}
