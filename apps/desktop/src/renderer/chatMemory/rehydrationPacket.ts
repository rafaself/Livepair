import type {
  ChatMessageRecord,
  RehydrationPacket,
  RehydrationPacketContextState,
  RehydrationPacketTurn,
} from '@livepair/shared-types';

export const DEFAULT_REHYDRATION_STABLE_INSTRUCTION =
  'Rehydrate this new Live session from the provided saved chat memory only. Prefer the summary and state when present, and use the recent turns as compact fallback context.';
export const MAX_REHYDRATION_RECENT_TURNS = 6;

type BuildRehydrationPacketOptions = {
  summary?: string | null;
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

function mapMessageToPacketTurn(record: ChatMessageRecord): RehydrationPacketTurn {
  return {
    role: record.role,
    kind: 'message',
    text: record.contentText,
    createdAt: record.createdAt,
    sequence: record.sequence,
  };
}

function selectRecentTurns(messages: readonly ChatMessageRecord[]): RehydrationPacketTurn[] {
  const orderedMessages = [...messages].sort(compareMessages);
  const compactMessages = orderedMessages.slice(-MAX_REHYDRATION_RECENT_TURNS);

  return compactMessages.map(mapMessageToPacketTurn);
}

function normalizeSummary(summary: string | null | undefined): string | null {
  if (typeof summary !== 'string') {
    return null;
  }

  const trimmedSummary = summary.trim();
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

  return {
    task: {
      entries: [...contextState.task.entries],
    },
    context: {
      entries: [...contextState.context.entries],
    },
  };
}

export function buildRehydrationPacket(
  messages: readonly ChatMessageRecord[],
  options: BuildRehydrationPacketOptions = {},
): RehydrationPacket {
  return {
    stableInstruction: DEFAULT_REHYDRATION_STABLE_INSTRUCTION,
    summary: normalizeSummary(options.summary),
    recentTurns: selectRecentTurns(messages),
    contextState: normalizeContextState(options.contextState),
  };
}
