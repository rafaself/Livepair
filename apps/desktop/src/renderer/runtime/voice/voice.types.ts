export type VoiceCaptureState =
  | 'idle'
  | 'requestingPermission'
  | 'capturing'
  | 'stopping'
  | 'stopped'
  | 'error';
export type VoicePlaybackState =
  | 'idle'
  | 'buffering'
  | 'playing'
  | 'stopping'
  | 'stopped'
  | 'error';
export type VoiceSessionStatus =
  | 'connecting'
  | 'ready'
  | 'interrupted'
  | 'recovering'
  | 'capturing'
  | 'streaming'
  | 'stopping'
  | 'disconnected'
  | 'error';

export type LocalVoiceChunk = {
  data: Uint8Array;
  sampleRateHz: 16_000;
  channels: 1;
  encoding: 'pcm_s16le';
  durationMs: 20;
  sequence: number;
};

export type VoiceCaptureDiagnostics = {
  chunkCount: number;
  sampleRateHz: number | null;
  bytesPerChunk: number | null;
  chunkDurationMs: number | null;
  selectedInputDeviceId: string | null;
  lastError: string | null;
};

export type VoicePlaybackDiagnostics = {
  chunkCount: number;
  queueDepth: number;
  sampleRateHz: number | null;
  selectedOutputDeviceId: string | null;
  lastError: string | null;
};

export type VoiceSessionLatencyMetricStatus = 'available' | 'pending' | 'unavailable';

export type VoiceSessionLatencyMetric = {
  status: VoiceSessionLatencyMetricStatus;
  valueMs: number | null;
  lastValueMs: number | null;
  startedAtMs: number | null;
};

export type VoiceSessionLatencyState = {
  connect: VoiceSessionLatencyMetric;
  firstModelResponse: VoiceSessionLatencyMetric;
  speechToFirstModelResponse: VoiceSessionLatencyMetric;
};

export type VoiceTranscriptEntry = {
  text: string;
  isFinal?: boolean | undefined;
};

export type CurrentVoiceTranscript = {
  user: VoiceTranscriptEntry;
  assistant: VoiceTranscriptEntry;
};

export type VoiceSessionResumptionStatus =
  | 'idle'
  | 'connected'
  | 'goAway'
  | 'reconnecting'
  | 'resumed'
  | 'resumeFailed';

export type VoiceSessionResumptionState = {
  status: VoiceSessionResumptionStatus;
  latestHandle: string | null;
  resumable: boolean;
  lastDetail: string | null;
};

export type VoiceSessionDurabilityState = {
  compressionEnabled: boolean;
  tokenValid: boolean;
  tokenRefreshing: boolean;
  tokenRefreshFailed: boolean;
  expireTime: string | null;
  newSessionExpireTime: string | null;
  lastDetail: string | null;
};

export type VoiceToolStatus =
  | 'idle'
  | 'toolCallPending'
  | 'toolExecuting'
  | 'toolResponding'
  | 'toolError';

export type VoiceToolState = {
  status: VoiceToolStatus;
  toolName: string | null;
  callId: string | null;
  lastError: string | null;
};

export type VoiceToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type VoiceToolResponse = {
  id: string;
  name: string;
  response: Record<string, unknown>;
};
