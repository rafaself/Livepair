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
import {
  BURST_SCREEN_SEND_INTERVAL_MS,
  CONTINUOUS_SCREEN_SEND_INTERVAL_MS,
} from '../runtime/screen/screenCaptureController';
import {
  createDefaultVisualSendDiagnostics as createDefaultScreenContextDiagnostics,
} from '../runtime/screen/screenContextDiagnostics';
import type {
  IgnoredAssistantOutputDiagnostics,
  SessionStoreData,
  VoiceSessionRecoveryDiagnostics,
  VoiceTranscriptDiagnostics,
} from './sessionStore.types';

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

export function buildDefaultVoiceTranscriptDiagnostics(): VoiceTranscriptDiagnostics {
  return {
    inputTranscriptCount: 0,
    lastInputTranscriptAt: null,
    outputTranscriptCount: 0,
    lastOutputTranscriptAt: null,
    assistantTextFallbackCount: 0,
    lastAssistantTextFallbackAt: null,
    lastAssistantTextFallbackReason: null,
  };
}

export function buildDefaultIgnoredAssistantOutputDiagnostics(): IgnoredAssistantOutputDiagnostics {
  return {
    totalCount: 0,
    countsByEventType: {
      textDelta: 0,
      outputTranscript: 0,
      audioChunk: 0,
      turnComplete: 0,
    },
    countsByReason: {
      turnUnavailable: 0,
      lifecycleFence: 0,
      noOpenTurnFence: 0,
    },
    lastIgnoredAt: null,
    lastIgnoredReason: null,
    lastIgnoredEventType: null,
    lastIgnoredVoiceSessionStatus: null,
  };
}

export function buildDefaultVoiceSessionRecoveryDiagnostics(): VoiceSessionRecoveryDiagnostics {
  return {
    transitionCount: 0,
    lastTransition: null,
    lastTransitionAt: null,
    lastRecoveryDetail: null,
    lastTurnResetReason: null,
    lastTurnResetAt: null,
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
  return createDefaultScreenContextDiagnostics(
    CONTINUOUS_SCREEN_SEND_INTERVAL_MS,
    BURST_SCREEN_SEND_INTERVAL_MS,
  );
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
    activeVoiceSessionGroundingEnabled: null,
    effectiveVoiceSessionCapabilities: null,
    voiceSessionLatency: createDefaultVoiceSessionLatencyState(),
    voiceSessionResumption: createDefaultVoiceSessionResumptionState(),
    voiceSessionDurability: createDefaultVoiceSessionDurabilityState(),
    voiceTranscriptDiagnostics: buildDefaultVoiceTranscriptDiagnostics(),
    ignoredAssistantOutputDiagnostics: buildDefaultIgnoredAssistantOutputDiagnostics(),
    voiceSessionRecoveryDiagnostics: buildDefaultVoiceSessionRecoveryDiagnostics(),
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
