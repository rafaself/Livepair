import type { CreateEphemeralTokenResponse } from '@livepair/shared-types';

export type ConversationRole = 'user' | 'assistant' | 'system';

export type ConversationTurnState = 'streaming' | 'complete' | 'error';

export type ConversationTurnModel = {
  id: string;
  role: ConversationRole;
  content: string;
  timestamp: string;
  state?: ConversationTurnState | undefined;
  statusLabel?: string | undefined;
};

export type TransportKind = 'backend-text' | 'gemini-live';
export type SessionMode = 'text' | 'voice';
export type ProductMode = 'text' | 'speech';
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

export type SessionPhase = 'idle' | 'starting' | 'active' | 'ending' | 'error';
export type TextSessionStatus =
  | 'idle'
  | 'connecting'
  | 'ready'
  | 'sending'
  | 'receiving'
  | 'generationCompleted'
  | 'completed'
  | 'interrupted'
  | 'goAway'
  | 'disconnecting'
  | 'disconnected'
  | 'error';
export type TextSessionLifecycle = {
  status: TextSessionStatus;
};

export type AssistantActivityState = 'idle' | 'listening' | 'thinking' | 'speaking';

export type TransportConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'error';

export type RuntimeDebugEvent = {
  scope: 'session' | 'transport';
  type: string;
  at: string;
  detail?: string | undefined;
};

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
export type SessionControllerEvent =
  | { type: 'session.backend.health.started' }
  | { type: 'session.backend.health.succeeded' }
  | { type: 'session.backend.health.failed'; detail: string }
  | { type: 'session.start.requested'; transport: TransportKind }
  | { type: 'session.token.request.started' }
  | { type: 'session.token.request.succeeded'; transport: TransportKind }
  | { type: 'session.token.request.failed'; detail: string }
  | { type: 'session.end.requested' }
  | { type: 'session.ended' }
  | { type: 'session.debug.state.set'; detail: string };

export type SessionConnectionState = 'connecting' | 'connected' | 'disconnected';

export type LiveSessionEvent =
  | {
      type: 'connection-state-changed';
      state: SessionConnectionState;
    }
  | {
      type: 'text-delta';
      text: string;
    }
  | {
      type: 'text-message';
      text: string;
    }
  | {
      type: 'audio-chunk';
      chunk: Uint8Array;
    }
  | {
      type: 'audio-error';
      detail: string;
    }
  | {
      type: 'input-transcript';
      text: string;
      isFinal?: boolean | undefined;
    }
  | {
      type: 'output-transcript';
      text: string;
      isFinal?: boolean | undefined;
    }
  | {
      type: 'interrupted';
    }
  | {
      type: 'generation-complete';
    }
  | {
      type: 'turn-complete';
    }
  | {
      type: 'go-away';
      detail?: string | undefined;
    }
  | {
      type: 'session-resumption-update';
      handle: string | null;
      resumable: boolean;
      detail?: string | undefined;
    }
  | {
      type: 'connection-terminated';
      detail?: string | undefined;
    }
  | {
      type: 'tool-call';
      calls: VoiceToolCall[];
    }
  | {
      type: 'error';
      detail: string;
    };

export type DesktopSessionConnectParams = {
  token: CreateEphemeralTokenResponse;
  mode: SessionMode;
  resumeHandle?: string | undefined;
};

export type DesktopSession = {
  kind: TransportKind;
  connect: (params: DesktopSessionConnectParams) => Promise<void>;
  sendText: (text: string) => Promise<void>;
  sendAudioChunk: (chunk: Uint8Array) => Promise<void>;
  sendAudioStreamEnd: () => Promise<void>;
  sendToolResponses: (responses: VoiceToolResponse[]) => Promise<void>;
  sendVideoFrame: (data: Uint8Array, mimeType: string) => Promise<void>;
  disconnect: () => Promise<void>;
  subscribe: (listener: (event: LiveSessionEvent) => void) => () => void;
};

export type AssistantAudioPlayback = {
  enqueue: (chunk: Uint8Array) => Promise<void>;
  stop: () => Promise<void>;
};

export type ScreenCaptureState =
  | 'disabled'
  | 'requestingPermission'
  | 'ready'
  | 'capturing'
  | 'streaming'
  | 'stopping'
  | 'error';

export type ScreenFrameUploadStatus = 'idle' | 'sending' | 'sent' | 'error';

export type ScreenCaptureDiagnostics = {
  captureSource: string | null;
  frameCount: number;
  frameRateHz: number | null;
  widthPx: number | null;
  heightPx: number | null;
  lastFrameAt: string | null;
  lastUploadStatus: ScreenFrameUploadStatus;
  lastError: string | null;
};

export type LocalScreenFrame = {
  data: Uint8Array;
  mimeType: 'image/jpeg';
  sequence: number;
  widthPx: number;
  heightPx: number;
};

export type RuntimeLogger = {
  onSessionEvent: (event: SessionControllerEvent) => void;
  onTransportEvent: (event: LiveSessionEvent) => void;
};
