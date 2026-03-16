import type {
  VoiceLiveSignalDiagnostics,
  VoiceSessionLatencyState,
  VoiceSessionDurabilityState,
  VoiceSessionResumptionState,
  VoiceToolState,
} from '../voice/voice.types';

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

export function createDefaultVoiceSessionLatencyState(): VoiceSessionLatencyState {
  return {
    connect: {
      status: 'unavailable',
      valueMs: null,
      lastValueMs: null,
      startedAtMs: null,
    },
    firstModelResponse: {
      status: 'unavailable',
      valueMs: null,
      lastValueMs: null,
      startedAtMs: null,
    },
    speechToFirstModelResponse: {
      status: 'unavailable',
      valueMs: null,
      lastValueMs: null,
      startedAtMs: null,
    },
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

export function createDefaultVoiceLiveSignalDiagnostics(): VoiceLiveSignalDiagnostics {
  return {
    inputAudioTranscriptionEnabled: false,
    outputAudioTranscriptionEnabled: false,
    responseModality: 'AUDIO',
    sessionResumptionEnabled: false,
    inputTranscriptCount: 0,
    lastInputTranscriptAt: null,
    outputTranscriptCount: 0,
    lastOutputTranscriptAt: null,
    assistantTextFallbackCount: 0,
    lastAssistantTextFallbackAt: null,
    ignoredOutputTotalCount: 0,
    ignoredTextDeltaCount: 0,
    ignoredOutputTranscriptCount: 0,
    ignoredAudioChunkCount: 0,
    ignoredTurnCompleteCount: 0,
    lastIgnoredReason: null,
    lastIgnoredEventType: null,
    lastIgnoredVoiceStatus: null,
  };
}
