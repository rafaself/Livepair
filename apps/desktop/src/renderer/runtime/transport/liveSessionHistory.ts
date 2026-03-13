import type { RehydrationPacket } from '@livepair/shared-types';
import type { LiveSessionHistoryTurn } from './transport.types';

export function mapRehydrationPacketToLiveSessionHistory(
  packet: RehydrationPacket,
): LiveSessionHistoryTurn[] {
  return packet.recentTurns.map((turn) => ({
    role: turn.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: turn.text }],
  }));
}
