import { create } from 'zustand';
import type { ChatId } from '@livepair/shared-types';
import type { ScreenCaptureSourceSnapshot, ScreenCaptureSource } from '../../shared';
import type { AssistantRuntimeState } from '../state/assistantUiState';
import {
  LIVE_ADAPTER_KEY,
  createDefaultVoiceSessionDurabilityState,
  createDefaultVoiceSessionResumptionState,
  createDefaultVoiceToolState,
  createDefaultRealtimeOutboundDiagnostics,
  createSpeechSessionLifecycle,
  createTextSessionLifecycle,
  deriveSessionPhaseFromLifecycle,
  deriveTransportStateFromLifecycle,
  type AssistantActivityState,
  type ConversationTurnModel,
  type CurrentVoiceTranscript,
  type ProductMode,
  type RealtimeOutboundDiagnostics,
  type RuntimeDebugEvent,
  type ScreenCaptureDiagnostics,
  type ScreenCaptureState,
  type SessionPhase,
  type SpeechLifecycle,
  type TextSessionLifecycle,
  type TextSessionStatus,
  type TranscriptArtifactModel,
  type TransportConnectionState,
  type TransportKind,
  type VoiceCaptureDiagnostics,
  type VoiceCaptureState,
  type VoicePlaybackDiagnostics,
  type VoicePlaybackState,
  type VoiceSessionDurabilityState,
  type VoiceSessionResumptionState,
  type VoiceSessionStatus,
  type VoiceToolState,
} from '../runtime/public';
export type BackendConnectionState = 'idle' | 'checking' | 'connected' | 'failed';
export type TokenRequestState = 'idle' | 'loading' | 'success' | 'error';

type SessionStoreData = {
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
  voiceSessionResumption: VoiceSessionResumptionState;
  voiceSessionDurability: VoiceSessionDurabilityState;
  voiceCaptureState: VoiceCaptureState;
  voiceCaptureDiagnostics: VoiceCaptureDiagnostics;
  voicePlaybackState: VoicePlaybackState;
  voicePlaybackDiagnostics: VoicePlaybackDiagnostics;
  currentVoiceTranscript: CurrentVoiceTranscript;
  voiceToolState: VoiceToolState;
  realtimeOutboundDiagnostics: RealtimeOutboundDiagnostics;
  screenCaptureState: ScreenCaptureState;
  screenCaptureDiagnostics: ScreenCaptureDiagnostics;
  screenCaptureSources: ScreenCaptureSource[];
  selectedScreenCaptureSourceId: string | null;
  localUserSpeechActive: boolean;
};

export type SessionStoreState = SessionStoreData & {
  setActiveChatId: (activeChatId: ChatId | null) => void;
  setCurrentMode: (currentMode: ProductMode) => void;
  setAssistantActivity: (assistantActivity: AssistantActivityState) => void;
  setBackendState: (backendState: BackendConnectionState) => void;
  setTokenRequestState: (tokenRequestState: TokenRequestState) => void;
  setTextSessionLifecycle: (textSessionLifecycle: TextSessionLifecycle) => void;
  setActiveTransport: (activeTransport: TransportKind | null) => void;
  appendConversationTurn: (turn: ConversationTurnModel) => void;
  replaceConversationTurns: (turns: ConversationTurnModel[]) => void;
  updateConversationTurn: (
    turnId: string,
    patch: Partial<
      Pick<
        ConversationTurnModel,
        'content' | 'state' | 'statusLabel' | 'source' | 'transcriptFinal' | 'persistedMessageId'
      >
    >,
  ) => void;
  removeConversationTurn: (turnId: string) => void;
  clearConversationTurns: () => void;
  appendTranscriptArtifact: (artifact: TranscriptArtifactModel) => void;
  updateTranscriptArtifact: (
    artifactId: string,
    patch: Partial<
      Pick<
        TranscriptArtifactModel,
        'content' | 'state' | 'statusLabel' | 'transcriptFinal' | 'attachedTurnId'
      >
    >,
  ) => void;
  removeTranscriptArtifact: (artifactId: string) => void;
  clearTranscriptArtifacts: () => void;
  setLastRuntimeError: (lastRuntimeError: string | null) => void;
  setLastDebugEvent: (lastDebugEvent: RuntimeDebugEvent | null) => void;
  setSpeechLifecycle: (speechLifecycle: SpeechLifecycle) => void;
  setVoiceSessionStatus: (voiceSessionStatus: VoiceSessionStatus) => void;
  setVoiceSessionResumption: (patch: Partial<VoiceSessionResumptionState>) => void;
  setVoiceSessionDurability: (patch: Partial<VoiceSessionDurabilityState>) => void;
  setVoiceCaptureState: (voiceCaptureState: VoiceCaptureState) => void;
  setVoiceCaptureDiagnostics: (
    patch: Partial<VoiceCaptureDiagnostics>,
  ) => void;
  setVoicePlaybackState: (voicePlaybackState: VoicePlaybackState) => void;
  setVoicePlaybackDiagnostics: (
    patch: Partial<VoicePlaybackDiagnostics>,
  ) => void;
  setVoiceToolState: (patch: Partial<VoiceToolState>) => void;
  setRealtimeOutboundDiagnostics: (
    diagnostics: RealtimeOutboundDiagnostics,
  ) => void;
  setCurrentVoiceTranscriptEntry: (
    role: keyof CurrentVoiceTranscript,
    patch: Partial<CurrentVoiceTranscript[keyof CurrentVoiceTranscript]>,
  ) => void;
  clearCurrentVoiceTranscript: () => void;
  setScreenCaptureState: (screenCaptureState: ScreenCaptureState) => void;
  setScreenCaptureDiagnostics: (patch: Partial<ScreenCaptureDiagnostics>) => void;
  setScreenCaptureSourceSnapshot: (snapshot: ScreenCaptureSourceSnapshot) => void;
  setLocalUserSpeechActive: (active: boolean) => void;
  setAssistantState: (assistantState: AssistantRuntimeState) => void;
  resetTextSessionRuntime: (
    textSessionStatus?: TextSessionStatus,
    options?: { preserveConversationTurns?: boolean },
  ) => void;
  reset: (overrides?: Partial<SessionStoreData>) => void;
};

type TimelineEntryWithOrdinal = {
  timelineOrdinal?: number | undefined;
};

function getNextTimelineOrdinal(
  state: Pick<SessionStoreData, 'conversationTurns' | 'transcriptArtifacts'>,
): number {
  return [...state.conversationTurns, ...state.transcriptArtifacts].reduce((maxOrdinal, entry) => {
    return Math.max(maxOrdinal, entry.timelineOrdinal ?? 0);
  }, 0) + 1;
}

function normalizeTimelineOrdinals<T extends TimelineEntryWithOrdinal>(
  entries: readonly T[],
): T[] {
  let nextOrdinal = 0;

  return entries.map((entry) => {
    const timelineOrdinal = entry.timelineOrdinal ?? (nextOrdinal + 1);
    nextOrdinal = Math.max(nextOrdinal, timelineOrdinal);

    return entry.timelineOrdinal === timelineOrdinal
      ? entry
      : {
          ...entry,
          timelineOrdinal,
        };
  });
}

function withDerivedLifecycleFields(
  textSessionLifecycle: TextSessionLifecycle,
): Pick<SessionStoreData, 'sessionPhase' | 'textSessionLifecycle' | 'transportState'> {
  return {
    sessionPhase: deriveSessionPhaseFromLifecycle(textSessionLifecycle.status),
    textSessionLifecycle,
    transportState: deriveTransportStateFromLifecycle(textSessionLifecycle.status),
  };
}

function buildDefaultVoiceCaptureDiagnostics(): VoiceCaptureDiagnostics {
  return {
    chunkCount: 0,
    sampleRateHz: null,
    bytesPerChunk: null,
    chunkDurationMs: null,
    selectedInputDeviceId: null,
    lastError: null,
  };
}

function buildDefaultVoicePlaybackDiagnostics(): VoicePlaybackDiagnostics {
  return {
    chunkCount: 0,
    queueDepth: 0,
    sampleRateHz: null,
    selectedOutputDeviceId: null,
    lastError: null,
  };
}

function buildDefaultCurrentVoiceTranscript(): CurrentVoiceTranscript {
  return {
    user: {
      text: '',
    },
    assistant: {
      text: '',
    },
  };
}

function buildDefaultScreenCaptureDiagnostics(): ScreenCaptureDiagnostics {
  return {
    captureSource: null,
    frameCount: 0,
    frameRateHz: null,
    widthPx: null,
    heightPx: null,
    lastFrameAt: null,
    lastUploadStatus: 'idle',
    lastError: null,
  };
}

function buildDefaultSessionState(): SessionStoreData {
  return {
    activeChatId: null,
    currentMode: 'inactive',
    ...withDerivedLifecycleFields(createTextSessionLifecycle()),
    assistantActivity: 'idle',
    backendState: 'idle',
    tokenRequestState: 'idle',
    activeTransport: null,
    conversationTurns: [],
    transcriptArtifacts: [],
    lastRuntimeError: null,
    lastDebugEvent: null,
    speechLifecycle: createSpeechSessionLifecycle(),
    voiceSessionStatus: 'disconnected',
    voiceSessionResumption: createDefaultVoiceSessionResumptionState(),
    voiceSessionDurability: createDefaultVoiceSessionDurabilityState(),
    voiceCaptureState: 'idle',
    voiceCaptureDiagnostics: buildDefaultVoiceCaptureDiagnostics(),
    voicePlaybackState: 'idle',
    voicePlaybackDiagnostics: buildDefaultVoicePlaybackDiagnostics(),
    currentVoiceTranscript: buildDefaultCurrentVoiceTranscript(),
    voiceToolState: createDefaultVoiceToolState(),
    realtimeOutboundDiagnostics: createDefaultRealtimeOutboundDiagnostics(),
    screenCaptureState: 'disabled',
    screenCaptureDiagnostics: buildDefaultScreenCaptureDiagnostics(),
    screenCaptureSources: [],
    selectedScreenCaptureSourceId: null,
    localUserSpeechActive: false,
  };
}

function getDebugRuntimeState(
  assistantState: AssistantRuntimeState,
  activeTransport: TransportKind | null,
): Partial<SessionStoreData> {
  if (assistantState === 'disconnected') {
    return {
      ...buildDefaultSessionState(),
    };
  }

  if (assistantState === 'ready') {
    return {
      ...withDerivedLifecycleFields(createTextSessionLifecycle('ready')),
      assistantActivity: 'idle',
      activeTransport: activeTransport ?? LIVE_ADAPTER_KEY,
      lastRuntimeError: null,
    };
  }

  if (assistantState === 'listening') {
    return {
      ...withDerivedLifecycleFields(createTextSessionLifecycle('ready')),
      assistantActivity: 'listening',
      activeTransport: activeTransport ?? LIVE_ADAPTER_KEY,
      lastRuntimeError: null,
    };
  }

  if (assistantState === 'thinking') {
    return {
      ...withDerivedLifecycleFields(createTextSessionLifecycle('connecting')),
      assistantActivity: 'thinking',
      activeTransport: activeTransport ?? LIVE_ADAPTER_KEY,
      lastRuntimeError: null,
    };
  }

  if (assistantState === 'speaking') {
    return {
      ...withDerivedLifecycleFields(createTextSessionLifecycle('receiving')),
      assistantActivity: 'speaking',
      activeTransport: activeTransport ?? LIVE_ADAPTER_KEY,
      lastRuntimeError: null,
    };
  }

  return {
    ...withDerivedLifecycleFields(createTextSessionLifecycle('error')),
    assistantActivity: 'idle',
    lastRuntimeError: 'Runtime forced into error state',
  };
}

export function getTextSessionStatus(
  state: Pick<SessionStoreState, 'textSessionLifecycle'>,
): TextSessionStatus {
  return state.textSessionLifecycle.status;
}

const defaultSessionState = buildDefaultSessionState();

export const useSessionStore = create<SessionStoreState>((set) => ({
  ...defaultSessionState,
  setActiveChatId: (activeChatId) => set({ activeChatId }),
  setCurrentMode: (currentMode) => set({ currentMode }),
  setAssistantActivity: (assistantActivity) => set({ assistantActivity }),
  setBackendState: (backendState) => set({ backendState }),
  setTokenRequestState: (tokenRequestState) => set({ tokenRequestState }),
  setTextSessionLifecycle: (textSessionLifecycle) =>
    set(withDerivedLifecycleFields(textSessionLifecycle)),
  setActiveTransport: (activeTransport) => set({ activeTransport }),
  appendConversationTurn: (turn) =>
    set((state) => ({
      conversationTurns: [
        ...state.conversationTurns,
        turn.timelineOrdinal === undefined
          ? {
              ...turn,
              timelineOrdinal: getNextTimelineOrdinal(state),
            }
          : turn,
      ],
    })),
  replaceConversationTurns: (conversationTurns) =>
    set({ conversationTurns: normalizeTimelineOrdinals(conversationTurns) }),
  updateConversationTurn: (turnId, patch) =>
    set((state) => ({
      conversationTurns: state.conversationTurns.map((turn) =>
        turn.id === turnId ? { ...turn, ...patch } : turn,
      ),
    })),
  removeConversationTurn: (turnId) =>
    set((state) => ({
      conversationTurns: state.conversationTurns.filter((turn) => turn.id !== turnId),
    })),
  clearConversationTurns: () => set({ conversationTurns: [] }),
  appendTranscriptArtifact: (artifact) =>
    set((state) => ({
      transcriptArtifacts: [
        ...state.transcriptArtifacts,
        artifact.timelineOrdinal === undefined
          ? {
              ...artifact,
              timelineOrdinal: getNextTimelineOrdinal(state),
            }
          : artifact,
      ],
    })),
  updateTranscriptArtifact: (artifactId, patch) =>
    set((state) => ({
      transcriptArtifacts: state.transcriptArtifacts.map((artifact) =>
        artifact.id === artifactId ? { ...artifact, ...patch } : artifact,
      ),
    })),
  removeTranscriptArtifact: (artifactId) =>
    set((state) => ({
      transcriptArtifacts: state.transcriptArtifacts.filter((artifact) => artifact.id !== artifactId),
    })),
  clearTranscriptArtifacts: () => set({ transcriptArtifacts: [] }),
  setLastRuntimeError: (lastRuntimeError) => set({ lastRuntimeError }),
  setLastDebugEvent: (lastDebugEvent) => set({ lastDebugEvent }),
  setSpeechLifecycle: (speechLifecycle) => set({ speechLifecycle }),
  setVoiceSessionStatus: (voiceSessionStatus) => set({ voiceSessionStatus }),
  setVoiceSessionResumption: (patch) =>
    set((state) => ({
      voiceSessionResumption: {
        ...state.voiceSessionResumption,
        ...patch,
      },
    })),
  setVoiceSessionDurability: (patch) =>
    set((state) => ({
      voiceSessionDurability: {
        ...state.voiceSessionDurability,
        ...patch,
      },
    })),
  setVoiceCaptureState: (voiceCaptureState) => set({ voiceCaptureState }),
  setVoiceCaptureDiagnostics: (patch) =>
    set((state) => ({
      voiceCaptureDiagnostics: {
        ...state.voiceCaptureDiagnostics,
        ...patch,
      },
    })),
  setVoicePlaybackState: (voicePlaybackState) => set({ voicePlaybackState }),
  setVoicePlaybackDiagnostics: (patch) =>
    set((state) => ({
      voicePlaybackDiagnostics: {
        ...state.voicePlaybackDiagnostics,
        ...patch,
      },
    })),
  setVoiceToolState: (patch) =>
    set((state) => ({
      voiceToolState: {
        ...state.voiceToolState,
        ...patch,
      },
    })),
  setRealtimeOutboundDiagnostics: (realtimeOutboundDiagnostics) =>
    set({ realtimeOutboundDiagnostics }),
  setCurrentVoiceTranscriptEntry: (role, patch) =>
    set((state) => ({
      currentVoiceTranscript: {
        ...state.currentVoiceTranscript,
        [role]: {
          ...state.currentVoiceTranscript[role],
          ...patch,
        },
      },
    })),
  clearCurrentVoiceTranscript: () =>
    set({
      currentVoiceTranscript: buildDefaultCurrentVoiceTranscript(),
    }),
  setScreenCaptureState: (screenCaptureState) => set({ screenCaptureState }),
  setScreenCaptureDiagnostics: (patch) =>
    set((state) => ({
      screenCaptureDiagnostics: {
        ...state.screenCaptureDiagnostics,
        ...patch,
      },
    })),
  setScreenCaptureSourceSnapshot: ({ sources, selectedSourceId }) =>
    set({
      screenCaptureSources: sources,
      selectedScreenCaptureSourceId: selectedSourceId,
    }),
  setLocalUserSpeechActive: (localUserSpeechActive) => set({ localUserSpeechActive }),
  setAssistantState: (assistantState) =>
    set((state) => ({
      ...getDebugRuntimeState(assistantState, state.activeTransport),
      currentMode: state.currentMode,
    })),
  resetTextSessionRuntime: (textSessionStatus = 'idle', options = {}) =>
    set((state) => ({
      currentMode: state.currentMode,
      activeChatId: state.activeChatId,
      ...withDerivedLifecycleFields(createTextSessionLifecycle(textSessionStatus)),
      assistantActivity: 'idle',
      backendState: 'idle',
      tokenRequestState: 'idle',
      activeTransport: null,
      conversationTurns: options.preserveConversationTurns ? state.conversationTurns : [],
      transcriptArtifacts: options.preserveConversationTurns
        ? state.transcriptArtifacts.filter((a) => a.state === 'complete')
        : [],
      lastRuntimeError: null,
      lastDebugEvent: null,
      speechLifecycle: createSpeechSessionLifecycle(),
      voiceSessionStatus: 'disconnected',
      voiceSessionResumption: createDefaultVoiceSessionResumptionState(),
      voiceSessionDurability: createDefaultVoiceSessionDurabilityState(),
      voiceCaptureState: state.voiceCaptureState,
      voiceCaptureDiagnostics: state.voiceCaptureDiagnostics,
      voicePlaybackState: state.voicePlaybackState,
      voicePlaybackDiagnostics: state.voicePlaybackDiagnostics,
      currentVoiceTranscript: buildDefaultCurrentVoiceTranscript(),
      voiceToolState: createDefaultVoiceToolState(),
      realtimeOutboundDiagnostics: createDefaultRealtimeOutboundDiagnostics(),
      screenCaptureState: 'disabled' as ScreenCaptureState,
      screenCaptureDiagnostics: buildDefaultScreenCaptureDiagnostics(),
      screenCaptureSources: [],
      selectedScreenCaptureSourceId: null,
      localUserSpeechActive: false,
    })),
  reset: (overrides) =>
    set(() => {
      const nextState = {
        ...buildDefaultSessionState(),
        ...overrides,
      };

      if (overrides?.textSessionLifecycle) {
        return {
          ...nextState,
          ...withDerivedLifecycleFields(overrides.textSessionLifecycle),
        };
      }

      return nextState;
    }),
}));
