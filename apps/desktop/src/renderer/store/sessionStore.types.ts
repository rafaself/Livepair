import type {
  ChatId,
  GeminiLiveEffectiveVoiceSessionCapabilities,
} from '@livepair/shared-types';
import type {
  ScreenCaptureOverlayDisplay,
  ScreenCaptureSource,
  ScreenCaptureSourceSnapshot,
} from '../../shared';
import type { AssistantRuntimeState } from '../runtime/assistantRuntimeState';
import type {
  AssistantActivityState,
  ConversationTurnModel,
  CurrentVoiceTranscript,
  ProductMode,
  RealtimeOutboundDiagnostics,
  RuntimeDebugEvent,
  ScreenCaptureDiagnostics,
  ScreenCaptureState,
  SessionPhase,
  SpeechLifecycle,
  TextSessionLifecycle,
  TextSessionStatus,
  TranscriptArtifactModel,
  TransportConnectionState,
  TransportKind,
  VisualSendDiagnostics,
  VoiceCaptureDiagnostics,
  VoiceCaptureState,
  VoiceLiveSignalDiagnostics,
  VoicePlaybackDiagnostics,
  VoicePlaybackState,
  VoiceSessionLatencyState,
  VoiceSessionDurabilityState,
  VoiceSessionResumptionState,
  VoiceSessionStatus,
  VoiceToolState,
} from '../runtime/public';

export type BackendConnectionState = 'idle' | 'checking' | 'connected' | 'failed';
export type TokenRequestState = 'idle' | 'loading' | 'success' | 'error';

export type AssistantTextFallbackReason = 'missing-output-transcript';
export type IgnoredAssistantOutputEventType =
  | 'text-delta'
  | 'output-transcript'
  | 'audio-chunk'
  | 'turn-complete';
export type IgnoredAssistantOutputReason =
  | 'turn-unavailable'
  | 'lifecycle-fence'
  | 'no-open-turn-fence';
export type VoiceSessionRecoveryTransition =
  | 'resume-requested'
  | 'resume-skipped'
  | 'token-refresh-required'
  | 'resume-aborted'
  | 'resume-connect-resolved'
  | 'resume-connect-failed'
  | 'fallback-connected'
  | 'fallback-failed'
  | 'session-resumption-updated';
export type VoiceTurnResetReason =
  | 'replayed-user-transcript'
  | 'new-user-transcript';

export type VoiceTranscriptDiagnostics = {
  inputTranscriptCount: number;
  lastInputTranscriptAt: string | null;
  outputTranscriptCount: number;
  lastOutputTranscriptAt: string | null;
  assistantTextFallbackCount: number;
  lastAssistantTextFallbackAt: string | null;
  lastAssistantTextFallbackReason: AssistantTextFallbackReason | null;
};

export type IgnoredAssistantOutputDiagnostics = {
  totalCount: number;
  countsByEventType: {
    textDelta: number;
    outputTranscript: number;
    audioChunk: number;
    turnComplete: number;
  };
  countsByReason: {
    turnUnavailable: number;
    lifecycleFence: number;
    noOpenTurnFence: number;
  };
  lastIgnoredAt: string | null;
  lastIgnoredReason: IgnoredAssistantOutputReason | null;
  lastIgnoredEventType: IgnoredAssistantOutputEventType | null;
  lastIgnoredVoiceSessionStatus: VoiceSessionStatus | null;
};

export type VoiceSessionRecoveryDiagnostics = {
  transitionCount: number;
  lastTransition: VoiceSessionRecoveryTransition | null;
  lastTransitionAt: string | null;
  lastRecoveryDetail: string | null;
  lastTurnResetReason: VoiceTurnResetReason | null;
  lastTurnResetAt: string | null;
};

export type SessionStoreData = {
  activeChatId: ChatId | null;
  currentMode: ProductMode;
  sessionPhase: SessionPhase;
  assistantActivity: AssistantActivityState;
  backendState: BackendConnectionState;
  tokenRequestState: TokenRequestState;
  transportState: TransportConnectionState;
  textSessionLifecycle: TextSessionLifecycle;
  activeTransport: TransportKind | null;
  conversationTurns: ConversationTurnModel[];
  transcriptArtifacts: TranscriptArtifactModel[];
  lastRuntimeError: string | null;
  lastDebugEvent: RuntimeDebugEvent | null;
  speechLifecycle: SpeechLifecycle;
  voiceSessionStatus: VoiceSessionStatus;
  activeVoiceSessionGroundingEnabled: boolean | null;
  effectiveVoiceSessionCapabilities: GeminiLiveEffectiveVoiceSessionCapabilities | null;
  voiceSessionLatency: VoiceSessionLatencyState;
  voiceSessionResumption: VoiceSessionResumptionState;
  voiceSessionDurability: VoiceSessionDurabilityState;
  voiceTranscriptDiagnostics: VoiceTranscriptDiagnostics;
  ignoredAssistantOutputDiagnostics: IgnoredAssistantOutputDiagnostics;
  voiceSessionRecoveryDiagnostics: VoiceSessionRecoveryDiagnostics;
  voiceCaptureState: VoiceCaptureState;
  voiceCaptureDiagnostics: VoiceCaptureDiagnostics;
  voicePlaybackState: VoicePlaybackState;
  voicePlaybackDiagnostics: VoicePlaybackDiagnostics;
  currentVoiceTranscript: CurrentVoiceTranscript;
  voiceToolState: VoiceToolState;
  voiceLiveSignalDiagnostics: VoiceLiveSignalDiagnostics;
  realtimeOutboundDiagnostics: RealtimeOutboundDiagnostics;
  screenShareIntended: boolean;
  screenCaptureState: ScreenCaptureState;
  screenCaptureDiagnostics: ScreenCaptureDiagnostics;
  visualSendDiagnostics: VisualSendDiagnostics;
  screenCaptureSources: ScreenCaptureSource[];
  selectedScreenCaptureSourceId: string | null;
  overlayDisplay: ScreenCaptureOverlayDisplay | null;
  localUserSpeechActive: boolean;
};

export type ConversationTurnPatch = Partial<
  Pick<
    ConversationTurnModel,
    'answerMetadata' |
    'content' | 'state' | 'statusLabel' | 'source' | 'transcriptFinal' | 'persistedMessageId'
  >
>;

export type TranscriptArtifactPatch = Partial<
  Pick<
    TranscriptArtifactModel,
    'content' | 'state' | 'statusLabel' | 'transcriptFinal' | 'attachedTurnId'
  >
>;

export type TextSessionRuntimeResetOptions = {
  preserveConversationTurns?: boolean;
};

export type SessionStoreActions = {
  setActiveChatId: (activeChatId: ChatId | null) => void;
  setCurrentMode: (currentMode: ProductMode) => void;
  setAssistantActivity: (assistantActivity: AssistantActivityState) => void;
  setBackendState: (backendState: BackendConnectionState) => void;
  setTokenRequestState: (tokenRequestState: TokenRequestState) => void;
  setTextSessionLifecycle: (textSessionLifecycle: TextSessionLifecycle) => void;
  setActiveTransport: (activeTransport: TransportKind | null) => void;
  appendConversationTurn: (turn: ConversationTurnModel) => void;
  replaceConversationTurns: (turns: ConversationTurnModel[]) => void;
  updateConversationTurn: (turnId: string, patch: ConversationTurnPatch) => void;
  removeConversationTurn: (turnId: string) => void;
  clearConversationTurns: () => void;
  appendTranscriptArtifact: (artifact: TranscriptArtifactModel) => void;
  updateTranscriptArtifact: (artifactId: string, patch: TranscriptArtifactPatch) => void;
  removeTranscriptArtifact: (artifactId: string) => void;
  clearTranscriptArtifacts: () => void;
  setLastRuntimeError: (lastRuntimeError: string | null) => void;
  setLastDebugEvent: (lastDebugEvent: RuntimeDebugEvent | null) => void;
  setSpeechLifecycle: (speechLifecycle: SpeechLifecycle) => void;
  setVoiceSessionStatus: (voiceSessionStatus: VoiceSessionStatus) => void;
  setActiveVoiceSessionGroundingEnabled: (enabled: boolean | null) => void;
  setEffectiveVoiceSessionCapabilities: (
    capabilities: GeminiLiveEffectiveVoiceSessionCapabilities | null,
  ) => void;
  setVoiceSessionLatency: (voiceSessionLatency: VoiceSessionLatencyState) => void;
  setVoiceSessionResumption: (patch: Partial<VoiceSessionResumptionState>) => void;
  setVoiceSessionDurability: (patch: Partial<VoiceSessionDurabilityState>) => void;
  setVoiceTranscriptDiagnostics: (patch: Partial<VoiceTranscriptDiagnostics>) => void;
  setIgnoredAssistantOutputDiagnostics: (
    patch: Partial<IgnoredAssistantOutputDiagnostics>,
  ) => void;
  setVoiceSessionRecoveryDiagnostics: (
    patch: Partial<VoiceSessionRecoveryDiagnostics>,
  ) => void;
  setVoiceCaptureState: (voiceCaptureState: VoiceCaptureState) => void;
  setVoiceCaptureDiagnostics: (patch: Partial<VoiceCaptureDiagnostics>) => void;
  setVoicePlaybackState: (voicePlaybackState: VoicePlaybackState) => void;
  setVoicePlaybackDiagnostics: (patch: Partial<VoicePlaybackDiagnostics>) => void;
  setVoiceToolState: (patch: Partial<VoiceToolState>) => void;
  updateVoiceLiveSignalDiagnostics: (patch: Partial<VoiceLiveSignalDiagnostics>) => void;
  setRealtimeOutboundDiagnostics: (
    diagnostics: RealtimeOutboundDiagnostics,
  ) => void;
  setCurrentVoiceTranscriptEntry: (
    role: keyof CurrentVoiceTranscript,
    patch: Partial<CurrentVoiceTranscript[keyof CurrentVoiceTranscript]>,
  ) => void;
  clearCurrentVoiceTranscript: () => void;
  setScreenShareIntended: (screenShareIntended: boolean) => void;
  setScreenCaptureState: (screenCaptureState: ScreenCaptureState) => void;
  setScreenCaptureDiagnostics: (patch: Partial<ScreenCaptureDiagnostics>) => void;
  setVisualSendDiagnostics: (diagnostics: VisualSendDiagnostics) => void;
  setScreenCaptureSourceSnapshot: (snapshot: ScreenCaptureSourceSnapshot) => void;
  setLocalUserSpeechActive: (active: boolean) => void;
  setAssistantState: (assistantState: AssistantRuntimeState) => void;
  resetTextSessionRuntime: (
    textSessionStatus?: TextSessionStatus,
    options?: TextSessionRuntimeResetOptions,
  ) => void;
  reset: (overrides?: Partial<SessionStoreData>) => void;
};

export type SessionStoreState = SessionStoreData & SessionStoreActions;

export type TimelineEntryWithOrdinal = {
  timelineOrdinal?: number | undefined;
};
