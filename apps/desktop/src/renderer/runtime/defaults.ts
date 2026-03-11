import type {
  VoiceSessionDurabilityState,
  VoiceSessionResumptionState,
  VoiceToolState,
} from './types';

export function createDefaultVoiceSessionResumptionState(): VoiceSessionResumptionState {
  return {
    status: 'idle' as const,
    latestHandle: null,
    resumable: false,
    lastDetail: null,
  };
}

export function createDefaultVoiceSessionDurabilityState(): VoiceSessionDurabilityState {
  return {
    compressionEnabled: false,
    tokenValid: false,
    tokenRefreshing: false,
    tokenRefreshFailed: false,
    expireTime: null,
    newSessionExpireTime: null,
    lastDetail: null,
  };
}

export function createDefaultVoiceToolState(): VoiceToolState {
  return {
    status: 'idle',
    toolName: null,
    callId: null,
    lastError: null,
  };
}
