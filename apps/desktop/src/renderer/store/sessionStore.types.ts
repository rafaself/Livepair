import type { ChatId } from '@livepair/shared-types';
import type {
  ScreenCaptureOverlayDisplay,
  ScreenCaptureSource,
  ScreenCaptureSourceSnapshot,
} from '../../shared';
import type { AssistantRuntimeState } from '../state/assistantUiState';
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
  voiceSessionLatency: VoiceSessionLatencyState;
  voiceSessionResumption: VoiceSessionResumptionState;
  voiceSessionDurability: VoiceSessionDurabilityState;
  voiceCaptureState: VoiceCaptureState;
  voiceCaptureDiagnostics: VoiceCaptureDiagnostics;
  voicePlaybackState: VoicePlaybackState;
  voicePlaybackDiagnostics: VoicePlaybackDiagnostics;
  currentVoiceTranscript: CurrentVoiceTranscript;
  voiceToolState: VoiceToolState;
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
  setVoiceSessionLatency: (voiceSessionLatency: VoiceSessionLatencyState) => void;
  setVoiceSessionResumption: (patch: Partial<VoiceSessionResumptionState>) => void;
  setVoiceSessionDurability: (patch: Partial<VoiceSessionDurabilityState>) => void;
  setVoiceCaptureState: (voiceCaptureState: VoiceCaptureState) => void;
  setVoiceCaptureDiagnostics: (patch: Partial<VoiceCaptureDiagnostics>) => void;
  setVoicePlaybackState: (voicePlaybackState: VoicePlaybackState) => void;
  setVoicePlaybackDiagnostics: (patch: Partial<VoicePlaybackDiagnostics>) => void;
  setVoiceToolState: (patch: Partial<VoiceToolState>) => void;
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
