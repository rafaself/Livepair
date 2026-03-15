import type { StoreApi } from 'zustand';
import {
  createDefaultRealtimeOutboundDiagnostics,
  createDefaultVoiceSessionDurabilityState,
  createDefaultVoiceSessionResumptionState,
  createDefaultVoiceToolState,
  createSpeechSessionLifecycle,
  createTextSessionLifecycle,
  type TextSessionStatus,
} from '../runtime/public';
import {
  buildDefaultCurrentVoiceTranscript,
  buildDefaultScreenCaptureDiagnostics,
  buildDefaultSessionState,
  buildDefaultVisualSendDiagnostics,
  getDebugRuntimeState,
  withDerivedLifecycleFields,
} from './sessionStore.defaults';
import type {
  SessionStoreActions,
  SessionStoreData,
  SessionStoreState,
  TextSessionRuntimeResetOptions,
  TimelineEntryWithOrdinal,
} from './sessionStore.types';

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

function buildResetTextSessionRuntimeState(
  state: SessionStoreState,
  textSessionStatus: TextSessionStatus,
  options: TextSessionRuntimeResetOptions,
): SessionStoreData {
  return {
    currentMode: state.currentMode,
    activeChatId: state.activeChatId,
    ...withDerivedLifecycleFields(createTextSessionLifecycle(textSessionStatus)),
    assistantActivity: 'idle',
    backendState: 'idle',
    tokenRequestState: 'idle',
    activeTransport: null,
    conversationTurns: options.preserveConversationTurns ? state.conversationTurns : [],
    transcriptArtifacts: options.preserveConversationTurns
      ? state.transcriptArtifacts.filter((artifact) => artifact.state === 'complete')
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
    screenShareIntended: false,
    screenCaptureState: 'disabled',
    screenCaptureDiagnostics: buildDefaultScreenCaptureDiagnostics(),
    visualSendDiagnostics: buildDefaultVisualSendDiagnostics(),
    screenCaptureSources: [],
    selectedScreenCaptureSourceId: null,
    overlayDisplay: null,
    localUserSpeechActive: false,
  };
}

export function createSessionStoreActions(
  set: StoreApi<SessionStoreState>['setState'],
): SessionStoreActions {
  return {
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
        transcriptArtifacts: state.transcriptArtifacts.filter(
          (artifact) => artifact.id !== artifactId,
        ),
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
    setScreenShareIntended: (screenShareIntended) => set({ screenShareIntended }),
    setScreenCaptureState: (screenCaptureState) => set({ screenCaptureState }),
    setScreenCaptureDiagnostics: (patch) =>
      set((state) => ({
        screenCaptureDiagnostics: {
          ...state.screenCaptureDiagnostics,
          ...patch,
        },
      })),
    setVisualSendDiagnostics: (visualSendDiagnostics) => set({ visualSendDiagnostics }),
    setScreenCaptureSourceSnapshot: ({ sources, selectedSourceId, overlayDisplay }) =>
      set({
        screenCaptureSources: sources,
        selectedScreenCaptureSourceId: selectedSourceId,
        overlayDisplay,
      }),
    setLocalUserSpeechActive: (localUserSpeechActive) => set({ localUserSpeechActive }),
    setAssistantState: (assistantState) =>
      set((state) => ({
        ...getDebugRuntimeState(assistantState, state.activeTransport),
        currentMode: state.currentMode,
      })),
    resetTextSessionRuntime: (textSessionStatus = 'idle', options = {}) =>
      set((state) => buildResetTextSessionRuntimeState(state, textSessionStatus, options)),
    reset: (overrides) =>
      set(() => {
        const nextState: SessionStoreData = {
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
  };
}
