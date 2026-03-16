import type { AssistantRuntimeState } from '../state/assistantUiState';
import {
  LIVE_ADAPTER_KEY,
  createDefaultRealtimeOutboundDiagnostics,
  createDefaultVoiceSessionLatencyState,
  createDefaultVoiceSessionDurabilityState,
  createDefaultVoiceSessionResumptionState,
  createDefaultVoiceToolState,
  createSpeechSessionLifecycle,
  createTextSessionLifecycle,
  deriveSessionPhaseFromLifecycle,
  deriveTransportStateFromLifecycle,
  type CurrentVoiceTranscript,
  type ScreenCaptureDiagnostics,
  type TextSessionLifecycle,
  type TransportKind,
  type VisualSendDiagnostics,
  type VoiceCaptureDiagnostics,
  type VoicePlaybackDiagnostics,
} from '../runtime/public';
import type { SessionStoreData } from './sessionStore.types';

export function withDerivedLifecycleFields(
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

export function buildDefaultCurrentVoiceTranscript(): CurrentVoiceTranscript {
  return {
    user: {
      text: '',
    },
    assistant: {
      text: '',
    },
  };
}

export function buildDefaultScreenCaptureDiagnostics(): ScreenCaptureDiagnostics {
  return {
    captureSource: null,
    frameCount: 0,
    frameRateHz: null,
    widthPx: null,
    heightPx: null,
    lastFrameAt: null,
    overlayMaskActive: false,
    maskedRectCount: 0,
    lastMaskedFrameAt: null,
    maskReason: 'hidden',
    lastUploadStatus: 'idle',
    lastError: null,
  };
}

export function buildDefaultVisualSendDiagnostics(): VisualSendDiagnostics {
  return {
    lastTransitionReason: null,
    snapshotCount: 0,
    streamingEnteredAt: null,
    streamingEndedAt: null,
    sentByState: { snapshot: 0, streaming: 0 },
    droppedByPolicy: 0,
    blockedByGateway: 0,
    triggerSnapshotCount: 0,
    burstCount: 0,
    manualFramesSentCount: 0,
    lastManualFrameAt: null,
  };
}

export function buildDefaultSessionState(): SessionStoreData {
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
    voiceSessionLatency: createDefaultVoiceSessionLatencyState(),
    voiceSessionResumption: createDefaultVoiceSessionResumptionState(),
    voiceSessionDurability: createDefaultVoiceSessionDurabilityState(),
    voiceCaptureState: 'idle',
    voiceCaptureDiagnostics: buildDefaultVoiceCaptureDiagnostics(),
    voicePlaybackState: 'idle',
    voicePlaybackDiagnostics: buildDefaultVoicePlaybackDiagnostics(),
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

export function getDebugRuntimeState(
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
