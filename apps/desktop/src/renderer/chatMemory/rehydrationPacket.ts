import type {
  ChatMessageRecord,
  RehydrationPacket,
  RehydrationPacketTurn,
} from '@livepair/shared-types';

export const DEFAULT_REHYDRATION_STABLE_INSTRUCTION =
  'Rehydrate this new Live session from the provided saved chat memory only. Prefer the summary and state when present, and use the recent turns as compact fallback context.';

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

export function buildRehydrationPacket(
  messages: readonly ChatMessageRecord[],
): RehydrationPacket {
  return {
    stableInstruction: DEFAULT_REHYDRATION_STABLE_INSTRUCTION,
    summary: null,
    recentTurns: [...messages].sort(compareMessages).map(mapMessageToPacketTurn),
    contextState: {
      task: {
        entries: [],
      },
      context: {
        entries: [],
      },
    },
  };
}
