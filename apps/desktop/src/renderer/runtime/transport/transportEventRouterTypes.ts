import type {
  AnswerMetadata,
  CreateEphemeralTokenResponse,
  GeminiLiveEffectiveVoiceSessionCapabilities,
} from '@livepair/shared-types';
import type { AssistantAudioPlayback } from '../audio/audio.types';
import type { SessionStoreApi, SettingsStoreApi } from '../core/sessionControllerTypes';
import type { RuntimeLogger, SessionEvent } from '../core/session.types';
import type { SpeechLifecycleStatus } from '../speech/speech.types';
import type {
  VoiceLiveSignalDiagnostics,
  VoicePlaybackDiagnostics,
  VoicePlaybackState,
  VoiceSessionDurabilityState,
  VoiceSessionResumptionState,
  VoiceSessionStatus,
  VoiceTranscriptUpdateResult,
  VoiceToolCall,
} from '../voice/voice.types';
import type { LiveRuntimeDiagnosticEvent } from '../session/liveRuntimeObservability';

export type TransportEventRouterOps = {
  store: SessionStoreApi;
  settingsStore: SettingsStoreApi;
  logger: RuntimeLogger;
  recordSessionEvent: (event: SessionEvent) => void;
  emitDiagnostic?: (event: LiveRuntimeDiagnosticEvent) => void;
  logRuntimeDiagnostic?: (
    scope: 'voice-session',
    message: string,
    detail: Record<string, unknown>,
  ) => void;
  isVoiceResumptionInFlight: () => boolean;
  setVoiceResumptionInFlight: (value: boolean) => void;
  currentVoiceSessionStatus: () => VoiceSessionStatus;
  currentSpeechLifecycleStatus: () => SpeechLifecycleStatus;
  getToken: () => CreateEphemeralTokenResponse | null;
  setVoiceSessionStatus: (status: VoiceSessionStatus) => void;
  setVoiceSessionResumption: (patch: Partial<VoiceSessionResumptionState>) => void;
  setVoiceSessionDurability: (patch: Partial<VoiceSessionDurabilityState>) => void;
  persistLiveSessionResumption: (patch: {
    resumptionHandle: string | null;
    lastResumptionUpdateAt: string;
    restorable: boolean;
    invalidatedAt: string | null;
    invalidationReason: string | null;
  }) => void;
  syncVoiceDurabilityState: (
    token: CreateEphemeralTokenResponse | null,
    patch?: Partial<VoiceSessionDurabilityState>,
  ) => void;
  setVoicePlaybackState: (state: VoicePlaybackState) => void;
  updateVoicePlaybackDiagnostics: (patch: Partial<VoicePlaybackDiagnostics>) => void;
  getVoicePlayback: () => AssistantAudioPlayback;
  stopVoicePlayback: (nextState?: VoicePlaybackState) => Promise<void>;
  cancelVoiceToolCalls: (detail?: string) => void;
  resetVoiceToolState: () => void;
  resetVoiceTurnTranscriptState: () => void;
  ensureAssistantVoiceTurn: () => boolean;
  finalizeCurrentVoiceTurns: (finalizeReason: 'completed' | 'interrupted') => void;
  attachCurrentAssistantTurn: (turnId: string | null) => void;
  enqueueVoiceToolCalls: (calls: VoiceToolCall[]) => void;
  handleVoiceInterruption: () => void;
  applyVoiceTranscriptUpdate: (
    role: 'user' | 'assistant',
    text: string,
    isFinal?: boolean,
  ) => VoiceTranscriptUpdateResult;
  appendAssistantDraftTextDelta: (text: string) => void;
  setAssistantAnswerMetadata: (answerMetadata: AnswerMetadata) => void;
  completeAssistantDraft: () => void;
  interruptAssistantDraft: () => void;
  discardAssistantDraft: () => void;
  commitAssistantDraft: () => string | null;
  hasOpenVoiceTurnFence: () => boolean;
  hasPendingVoiceToolCall: () => boolean;
  hasActiveAssistantVoiceTurn: () => boolean;
  hasQueuedMixedModeAssistantReply: () => boolean;
  hasStreamingAssistantVoiceTurn: () => boolean;
  shouldIgnoreAssistantOutput: (
    eventType: 'text-delta' | 'output-transcript' | 'audio-chunk' | 'turn-complete',
    options: {
      hasQueuedMixedModeAssistantReply: boolean;
      hasStreamingAssistantVoiceTurn: boolean;
    },
  ) => {
    ignore: boolean;
    reason?: 'turn-unavailable';
  };
  deriveTurnCompleteEvent: () => Extract<
    SessionEvent,
    { type: 'turn.assistantCompleted' } | { type: 'turn.user.settled' }
  > | null;
  setVoiceErrorState: (detail: string) => void;
  cleanupTransport: () => void;
  resumeVoiceSession: (detail: string) => Promise<void>;
  restoreScreenCapture: () => void;
  updateVoiceLiveSignalDiagnostics: (patch: Partial<VoiceLiveSignalDiagnostics>) => void;
  getActiveLiveCapabilities: () => GeminiLiveEffectiveVoiceSessionCapabilities | null;
};

export type TransportEventRouterContext = {
  ops: TransportEventRouterOps;
  store: ReturnType<SessionStoreApi['getState']>;
};
