import type {
  ChatMessageRecord,
  RehydrationPacket,
  RehydrationPacketContextState,
  RehydrationPacketTurn,
} from '@livepair/shared-types';
import { normalizeScreenContextState } from './screenContextState';

export const DEFAULT_REHYDRATION_STABLE_INSTRUCTION =
  'Rehydrate this new Live session from the provided saved chat memory only. Prefer the summary and state when present, and use the recent turns as compact fallback context.';
export const MAX_REHYDRATION_RECENT_TURNS = 6;
export const MAX_REHYDRATION_SUMMARY_LENGTH = 1600;
export const MAX_REHYDRATION_TURN_TEXT_LENGTH = 400;
const MAX_REHYDRATION_SUMMARY_COVERAGE_LAG = 24;
const SUMMARY_TAIL_BOUNDARY_ANCHOR_TURNS = 2;

type BuildRehydrationPacketOptions = {
  summary?: string | null;
  summaryCoveredThroughSequence?: number | null;
  contextState?: RehydrationPacketContextState | null;
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

function normalizeTurnText(text: string): string {
  return text.trim().slice(0, MAX_REHYDRATION_TURN_TEXT_LENGTH);
}

function mapMessageToPacketTurn(record: ChatMessageRecord): RehydrationPacketTurn {
  return {
    role: record.role,
    kind: 'message',
    text: normalizeTurnText(record.contentText),
    createdAt: record.createdAt,
    sequence: record.sequence,
  };
}

function normalizeSummaryCoverageSequence(
  summaryCoveredThroughSequence: number | null | undefined,
  latestMessageSequence: number | null,
): number | null {
  if (
    typeof summaryCoveredThroughSequence !== 'number'
    || !Number.isFinite(summaryCoveredThroughSequence)
  ) {
    return null;
  }

  const normalizedCoverage = Math.floor(summaryCoveredThroughSequence);

  if (normalizedCoverage <= 0) {
    return null;
  }

  if (latestMessageSequence === null || normalizedCoverage > latestMessageSequence) {
    return null;
  }

  return latestMessageSequence - normalizedCoverage > MAX_REHYDRATION_SUMMARY_COVERAGE_LAG
    ? null
    : normalizedCoverage;
}

function selectRecentTurns(
  messages: readonly ChatMessageRecord[],
  summaryCoveredThroughSequence: number | null,
): RehydrationPacketTurn[] {
  const orderedMessages = [...messages].sort(compareMessages);
  const candidateMessages = summaryCoveredThroughSequence === null
    ? orderedMessages
    : orderedMessages.filter((message) => message.sequence > summaryCoveredThroughSequence);

  if (
    summaryCoveredThroughSequence === null
    || candidateMessages.length <= MAX_REHYDRATION_RECENT_TURNS
  ) {
    return candidateMessages
      .slice(-MAX_REHYDRATION_RECENT_TURNS)
      .map(mapMessageToPacketTurn);
  }

  const boundaryAnchorMessages = candidateMessages.slice(0, SUMMARY_TAIL_BOUNDARY_ANCHOR_TURNS);
  const remainingCapacity = MAX_REHYDRATION_RECENT_TURNS - boundaryAnchorMessages.length;
  const newestTailMessages = remainingCapacity > 0
    ? candidateMessages.slice(-remainingCapacity)
    : [];
  const compactMessages = [...boundaryAnchorMessages];

  for (const message of newestTailMessages) {
    if (compactMessages.some((existingMessage) => existingMessage.id === message.id)) {
      continue;
    }

    compactMessages.push(message);
  }

  return compactMessages.map(mapMessageToPacketTurn);
}

function normalizeSummary(summary: string | null | undefined): string | null {
  if (typeof summary !== 'string') {
    return null;
  }

  const trimmedSummary = summary.trim().slice(0, MAX_REHYDRATION_SUMMARY_LENGTH);
  return trimmedSummary.length > 0 ? trimmedSummary : null;
}

function buildEmptyContextState(): RehydrationPacketContextState {
  return {
    task: {
      entries: [],
    },
    context: {
      entries: [],
    },
  };
}

function normalizeContextState(
  contextState: RehydrationPacketContextState | null | undefined,
): RehydrationPacketContextState {
  if (!contextState) {
    return buildEmptyContextState();
  }

  return normalizeScreenContextState({
    task: {
      entries: [...contextState.task.entries],
    },
    context: {
      entries: [...contextState.context.entries],
    },
  });
}

export function buildRehydrationPacket(
  messages: readonly ChatMessageRecord[],
  options: BuildRehydrationPacketOptions = {},
): RehydrationPacket {
  const latestMessageSequence = messages.reduce<number | null>(
    (latestSequence, message) => {
      if (latestSequence === null || message.sequence > latestSequence) {
        return message.sequence;
      }

      return latestSequence;
    },
    null,
  );
  const normalizedSummary = normalizeSummary(options.summary);
  const summaryCoveredThroughSequence = normalizedSummary === null
    ? null
    : normalizeSummaryCoverageSequence(
      options.summaryCoveredThroughSequence,
      latestMessageSequence,
    );

  return {
    stableInstruction: DEFAULT_REHYDRATION_STABLE_INSTRUCTION,
    summary: normalizedSummary,
    recentTurns: selectRecentTurns(messages, summaryCoveredThroughSequence),
    contextState: normalizeContextState(options.contextState),
  };
}
