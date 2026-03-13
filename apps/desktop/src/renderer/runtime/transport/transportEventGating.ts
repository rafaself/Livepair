import type { VoiceSessionStatus } from '../voice/voice.types';

export function shouldIgnoreTermination(status: VoiceSessionStatus): boolean {
  return status === 'stopping' || status === 'disconnected' || status === 'error';
}

export function isAssistantTurnUnavailable(status: VoiceSessionStatus): boolean {
  return (
    status === 'interrupted'
    || status === 'recovering'
    || status === 'stopping'
    || status === 'disconnected'
    || status === 'error'
  );
}
