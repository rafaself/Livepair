import { create } from 'zustand';
import type { AssistantRuntimeState } from '../state/assistantUiState';
import { LIVE_ADAPTER_KEY } from '../runtime/transport/liveConfig';
import {
  createDefaultVoiceSessionDurabilityState,
  createDefaultVoiceSessionResumptionState,
  createDefaultVoiceToolState,
} from '../runtime/core/defaults';
import { createSpeechSessionLifecycle } from '../runtime/speech/speechSessionLifecycle';
import {
  createTextSessionLifecycle,
  deriveSessionPhaseFromLifecycle,
  deriveTransportStateFromLifecycle,
} from '../runtime/text/textSessionLifecycle';
import type {
  AssistantActivityState,
  ProductMode,
  SessionPhase,
  RuntimeDebugEvent,
} from '../runtime/core/session.types';
import type {
  TransportConnectionState,
  TransportKind,
} from '../runtime/transport/transport.types';
import type {
  CurrentVoiceTranscript,
  VoiceCaptureDiagnostics,
  VoiceCaptureState,
  VoiceSessionDurabilityState,
  VoiceSessionResumptionState,
  VoicePlaybackDiagnostics,
  VoicePlaybackState,
  VoiceSessionStatus,
  VoiceToolState,
} from '../runtime/voice/voice.types';
import type {
  ConversationTurnModel,
} from '../runtime/conversation/conversation.types';
import type {
  ScreenCaptureDiagnostics,
  ScreenCaptureState,
} from '../runtime/screen/screen.types';
import type {
  SpeechLifecycle,
} from '../runtime/speech/speech.types';
import type {
  TextSessionLifecycle,
  TextSessionStatus,
} from '../runtime/text/text.types';

export type BackendConnectionState = 'idle' | 'checking' | 'connected' | 'failed';
export type TokenRequestState = 'idle' | 'loading' | 'success' | 'error';

type SessionStoreData = {
  currentMode: ProductMode;
  sessionPhase: SessionPhase;
  assistantActivity: AssistantActivityState;
  backendState: BackendConnectionState;
  tokenRequestState: TokenRequestState;
  transportState: TransportConnectionState;
  textSessionLifecycle: TextSessionLifecycle;
  activeTransport: TransportKind | null;
  conversationTurns: ConversationTurnModel[];
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
  screenCaptureState: ScreenCaptureState;
  screenCaptureDiagnostics: ScreenCaptureDiagnostics;
};

export type SessionStoreState = SessionStoreData & {
  setCurrentMode: (currentMode: ProductMode) => void;
  setAssistantActivity: (assistantActivity: AssistantActivityState) => void;
  setBackendState: (backendState: BackendConnectionState) => void;
  setTokenRequestState: (tokenRequestState: TokenRequestState) => void;
  setTextSessionLifecycle: (textSessionLifecycle: TextSessionLifecycle) => void;
  setActiveTransport: (activeTransport: TransportKind | null) => void;
  appendConversationTurn: (turn: ConversationTurnModel) => void;
  updateConversationTurn: (
    turnId: string,
    patch: Pick<ConversationTurnModel, 'content' | 'state' | 'statusLabel'>,
  ) => void;
  clearConversationTurns: () => void;
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
  setCurrentVoiceTranscriptEntry: (
    role: keyof CurrentVoiceTranscript,
    patch: Partial<CurrentVoiceTranscript[keyof CurrentVoiceTranscript]>,
  ) => void;
  clearCurrentVoiceTranscript: () => void;
  setScreenCaptureState: (screenCaptureState: ScreenCaptureState) => void;
  setScreenCaptureDiagnostics: (patch: Partial<ScreenCaptureDiagnostics>) => void;
  setAssistantState: (assistantState: AssistantRuntimeState) => void;
  resetTextSessionRuntime: (textSessionStatus?: TextSessionStatus) => void;
  reset: (overrides?: Partial<SessionStoreData>) => void;
};

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
    currentMode: 'text',
    ...withDerivedLifecycleFields(createTextSessionLifecycle()),
    assistantActivity: 'idle',
    backendState: 'idle',
    tokenRequestState: 'idle',
    activeTransport: null,
    conversationTurns: [],
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
    screenCaptureState: 'disabled',
    screenCaptureDiagnostics: buildDefaultScreenCaptureDiagnostics(),
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
  setCurrentMode: (currentMode) => set({ currentMode }),
  setAssistantActivity: (assistantActivity) => set({ assistantActivity }),
  setBackendState: (backendState) => set({ backendState }),
  setTokenRequestState: (tokenRequestState) => set({ tokenRequestState }),
  setTextSessionLifecycle: (textSessionLifecycle) =>
    set(withDerivedLifecycleFields(textSessionLifecycle)),
  setActiveTransport: (activeTransport) => set({ activeTransport }),
  appendConversationTurn: (turn) =>
    set((state) => ({
      conversationTurns: [...state.conversationTurns, turn],
    })),
  updateConversationTurn: (turnId, patch) =>
    set((state) => ({
      conversationTurns: state.conversationTurns.map((turn) =>
        turn.id === turnId ? { ...turn, ...patch } : turn,
      ),
    })),
  clearConversationTurns: () => set({ conversationTurns: [] }),
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
  setAssistantState: (assistantState) =>
    set((state) => ({
      ...getDebugRuntimeState(assistantState, state.activeTransport),
      currentMode: state.currentMode,
    })),
  resetTextSessionRuntime: (textSessionStatus = 'idle') =>
    set((state) => ({
      currentMode: state.currentMode,
      ...withDerivedLifecycleFields(createTextSessionLifecycle(textSessionStatus)),
      assistantActivity: 'idle',
      backendState: 'idle',
      tokenRequestState: 'idle',
      activeTransport: null,
      conversationTurns: [],
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
      screenCaptureState: 'disabled' as ScreenCaptureState,
      screenCaptureDiagnostics: buildDefaultScreenCaptureDiagnostics(),
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
