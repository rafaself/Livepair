import type {
  ChatId,
  ChatMessageRecord,
  DurableChatSummaryRecord,
} from '@livepair/shared-types';

export const DURABLE_CHAT_SUMMARY_SCHEMA_VERSION = 1 as const;
export const DURABLE_CHAT_SUMMARY_SOURCE = 'local-recent-history-v1' as const;
export const DURABLE_CHAT_SUMMARY_MAX_TURNS = 6;
const MAX_DURABLE_CHAT_SUMMARY_LINE_LENGTH = 240;
const MAX_DURABLE_CHAT_SUMMARY_TEXT_LENGTH = 1600;

type BuildDurableChatSummaryInput = {
  chatId: ChatId;
  messages: readonly ChatMessageRecord[];
  updatedAt: string;
};

function compareMessages(left: ChatMessageRecord, right: ChatMessageRecord): number {
  if (left.sequence !== right.sequence) {
    return left.sequence - right.sequence;
  }

  if (left.createdAt !== right.createdAt) {
    return left.createdAt.localeCompare(right.createdAt);
  }

  return left.id.localeCompare(right.id);
}

function normalizeSummaryLine(contentText: string): string {
  const trimmedContent = contentText.trim().replace(/\s+/g, ' ');
  return trimmedContent.slice(0, MAX_DURABLE_CHAT_SUMMARY_LINE_LENGTH);
}

function clampSummaryText(summaryText: string): string {
  const trimmedSummaryText = summaryText.trim();
  return trimmedSummaryText.slice(0, MAX_DURABLE_CHAT_SUMMARY_TEXT_LENGTH);
}

export function buildDurableChatSummary(
  input: BuildDurableChatSummaryInput,
): DurableChatSummaryRecord | null {
  const orderedMessages = [...input.messages].sort(compareMessages);

  if (orderedMessages.length === 0) {
    return null;
  }

  const coveredThroughSequence = orderedMessages[orderedMessages.length - 1]!.sequence;
  const compactMessages = orderedMessages.slice(-DURABLE_CHAT_SUMMARY_MAX_TURNS);
  const summaryLines = compactMessages.map((message) => {
    const speakerLabel = message.role === 'assistant' ? 'Assistant' : 'User';
    return `${speakerLabel}: ${normalizeSummaryLine(message.contentText)}`;
  });

  return {
    chatId: input.chatId,
    schemaVersion: DURABLE_CHAT_SUMMARY_SCHEMA_VERSION,
    source: DURABLE_CHAT_SUMMARY_SOURCE,
    summaryText: clampSummaryText(
      [
        `Compact continuity summary from canonical chat history through turn ${coveredThroughSequence}.`,
        ...summaryLines,
      ].join('\n'),
    ),
    coveredThroughSequence,
    updatedAt: input.updatedAt,
  };
}

export function shouldReplaceDurableChatSummary(
  existingSummary: DurableChatSummaryRecord | null,
  nextSummary: DurableChatSummaryRecord,
): boolean {
  return (
    existingSummary === null ||
    nextSummary.coveredThroughSequence > existingSummary.coveredThroughSequence
  );
}
