import type { RehydrationPacketTurn } from '@livepair/shared-types';
import type { LiveSessionHistoryTurn } from './transport.types';

export function mapRehydrationTurnsToLiveSessionHistory(
  turns: RehydrationPacketTurn[],
): LiveSessionHistoryTurn[] {
  return turns.map((turn) => ({
    role: turn.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: turn.text }],
  }));
}
