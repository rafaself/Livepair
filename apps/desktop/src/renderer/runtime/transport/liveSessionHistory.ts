import type {
  RehydrationPacket,
  RehydrationPacketStateSection,
  RehydrationPacketTurn,
} from '@livepair/shared-types';
import type { LiveSessionHistoryTurn } from './transport.types';

export function mapRehydrationTurnsToLiveSessionHistory(
  turns: RehydrationPacketTurn[],
): LiveSessionHistoryTurn[] {
  return turns.map((turn) => ({
    role: turn.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: turn.text }],
  }));
}

function formatRehydrationStateSection(
  label: string,
  section: RehydrationPacketStateSection,
): string | null {
  if (section.entries.length === 0) {
    return null;
  }

  return `Saved ${label} state:\n${section.entries.map((entry) => `- ${entry.key}: ${entry.value}`).join('\n')}`;
}

function buildRehydrationMemoryTurnText(packet: RehydrationPacket): string | null {
  const normalizedSummary = packet.summary?.trim() ?? '';
  const taskState = formatRehydrationStateSection('task', packet.contextState.task);
  const contextState = formatRehydrationStateSection('context', packet.contextState.context);

  if (normalizedSummary.length === 0 && taskState === null && contextState === null) {
    return null;
  }

  return [
    packet.stableInstruction.trim(),
    ...(normalizedSummary.length > 0 ? [`Saved summary:\n${normalizedSummary}`] : []),
    ...(taskState ? [taskState] : []),
    ...(contextState ? [contextState] : []),
  ].join('\n\n');
}

export function mapRehydrationPacketToLiveSessionHistory(
  packet: RehydrationPacket,
): LiveSessionHistoryTurn[] {
  const memoryTurnText = buildRehydrationMemoryTurnText(packet);

  return [
    ...(memoryTurnText
      ? [{
          role: 'user' as const,
          parts: [{ text: memoryTurnText }],
        }]
      : []),
    ...mapRehydrationTurnsToLiveSessionHistory(packet.recentTurns),
  ];
}
