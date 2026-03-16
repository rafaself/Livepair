import type { GeminiLiveEffectiveVoiceSessionCapabilities } from '@livepair/shared-types';

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

/**
 * Compact per-session signal diagnostics that answer the five key debugging
 * questions for speech/chat regressions:
 *   1. What capabilities was the session started with?
 *   2. Are transcript events actually arriving?
 *   3. Is the text-delta fallback path being used?
 *   4. Is assistant output being ignored, and why?
 *
 * Counts and timestamps accumulate for the lifetime of the active Gemini Live
 * voice session. Resume/reconnect keeps the same session snapshot; only a
 * fresh or replacement voice session resets these counters.
 */
export type VoiceLiveSignalDiagnostics = GeminiLiveEffectiveVoiceSessionCapabilities & {
  // Capability contract — snapshotted from live config on fresh session connect.
  // Resumed connections intentionally preserve the original session snapshot.
  // Transcript arrival.
  inputTranscriptCount: number;
  lastInputTranscriptAt: string | null;
  outputTranscriptCount: number;
  lastOutputTranscriptAt: string | null;
  // Text-delta processed in voice mode (fallback when output-transcript is absent).
  assistantTextFallbackCount: number;
  lastAssistantTextFallbackAt: string | null;
  // Ignored assistant output — promoted from in-memory WeakMap to store.
  ignoredOutputTotalCount: number;
  ignoredTextDeltaCount: number;
  ignoredOutputTranscriptCount: number;
  ignoredAudioChunkCount: number;
  ignoredTurnCompleteCount: number;
  lastIgnoredReason: string | null;
  lastIgnoredEventType: string | null;
  lastIgnoredVoiceStatus: string | null;
};
