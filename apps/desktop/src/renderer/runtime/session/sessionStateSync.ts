import {
  createDefaultVoiceSessionLatencyState,
  createDefaultVoiceSessionDurabilityState,
  createDefaultVoiceSessionResumptionState,
} from '../core/defaults';
import {
  isSpeechLifecycleActive,
  reduceSpeechSessionLifecycle,
  type SpeechSessionLifecycleEvent,
} from '../speech/speechSessionLifecycle';
import type { AssistantAudioPlayback } from '../audio/audio.types';
import type {
  ProductMode,
} from '../core/session.types';
import type {
  SessionStoreApi,
  SettingsStoreApi,
} from '../core/sessionControllerTypes';
import type {
  SpeechLifecycleStatus,
} from '../speech/speech.types';
import type {
  VoiceSessionLatencyMetric,
  VoiceSessionLatencyState,
  VoiceSessionDurabilityState,
  VoiceSessionResumptionState,
  VoiceSessionStatus,
  VoicePlaybackDiagnostics,
  VoicePlaybackState,
  VoiceToolState,
} from '../voice/voice.types';
import type {
  CreateEphemeralTokenResponse,
} from '@livepair/shared-types';

type SessionControllerStateSyncArgs = {
  store: SessionStoreApi;
  settingsStore: SettingsStoreApi;
  onSpeechLifecycleTransition: (
    previousStatus: SpeechLifecycleStatus,
    nextStatus: SpeechLifecycleStatus,
    eventType: string,
  ) => void;
  handleSpeechLifecycleStatusChange: (status: SpeechLifecycleStatus) => void;
  updateVoicePlaybackDiagnostics: (
    patch: Partial<VoicePlaybackDiagnostics>,
  ) => void;
  setVoicePlaybackState: (state: VoicePlaybackState) => void;
  getVoicePlayback: () => AssistantAudioPlayback;
  setVoiceToolState: (patch: Partial<VoiceToolState>) => void;
  resetVoiceToolState: () => void;
  clearCurrentVoiceTranscript: () => void;
  resetVoiceTurnTranscriptState: () => void;
  applyVoiceTranscriptUpdate: (
    role: 'user' | 'assistant',
    text: string,
    isFinal?: boolean,
  ) => void;
  syncVoiceDurabilityState: (
    token: CreateEphemeralTokenResponse | null,
    patch?: Partial<VoiceSessionDurabilityState>,
  ) => void;
  getNowMs?: () => number;
};

function getLastLatencyValue(metric: VoiceSessionLatencyMetric): number | null {
  return metric.valueMs ?? metric.lastValueMs;
}

function startPendingLatencyMetric(
  metric: VoiceSessionLatencyMetric,
  startedAtMs: number,
): VoiceSessionLatencyMetric {
  return {
    status: 'pending',
    valueMs: null,
    lastValueMs: getLastLatencyValue(metric),
    startedAtMs,
  };
}

function resolvePendingLatencyMetric(
  metric: VoiceSessionLatencyMetric,
  completedAtMs: number,
): VoiceSessionLatencyMetric {
  if (metric.status !== 'pending' || metric.startedAtMs === null) {
    return metric;
  }

  const valueMs = Math.max(0, completedAtMs - metric.startedAtMs);

  return {
    status: 'available',
    valueMs,
    lastValueMs: valueMs,
    startedAtMs: null,
  };
}

function markLatencyMetricUnavailable(metric: VoiceSessionLatencyMetric): VoiceSessionLatencyMetric {
  const nextLastValueMs = getLastLatencyValue(metric);

  if (
    metric.status === 'unavailable'
    && metric.valueMs === null
    && metric.startedAtMs === null
    && metric.lastValueMs === nextLastValueMs
  ) {
    return metric;
  }

  return {
    status: 'unavailable',
    valueMs: null,
    lastValueMs: nextLastValueMs,
    startedAtMs: null,
  };
}

function clearPendingLatencyMetric(metric: VoiceSessionLatencyMetric): VoiceSessionLatencyMetric {
  return metric.status === 'pending' ? markLatencyMetricUnavailable(metric) : metric;
}

function reduceVoiceSessionLatency(
  latency: VoiceSessionLatencyState,
  event: SpeechSessionLifecycleEvent,
  nowMs: number,
): VoiceSessionLatencyState {
  switch (event.type) {
    case 'session.start.requested':
      return {
        connect: startPendingLatencyMetric(latency.connect, nowMs),
        firstModelResponse: markLatencyMetricUnavailable(latency.firstModelResponse),
        speechToFirstModelResponse: markLatencyMetricUnavailable(latency.speechToFirstModelResponse),
      };
    case 'session.ready':
      return {
        connect: resolvePendingLatencyMetric(latency.connect, nowMs),
        firstModelResponse: startPendingLatencyMetric(latency.firstModelResponse, nowMs),
        speechToFirstModelResponse: markLatencyMetricUnavailable(latency.speechToFirstModelResponse),
      };
    case 'user.speech.detected':
      return {
        ...latency,
        speechToFirstModelResponse: startPendingLatencyMetric(
          latency.speechToFirstModelResponse,
          nowMs,
        ),
      };
    case 'assistant.output.started':
      return {
        ...latency,
        firstModelResponse: resolvePendingLatencyMetric(latency.firstModelResponse, nowMs),
        speechToFirstModelResponse: resolvePendingLatencyMetric(
          latency.speechToFirstModelResponse,
          nowMs,
        ),
      };
    case 'session.end.requested':
    case 'session.ended':
      return {
        connect: clearPendingLatencyMetric(latency.connect),
        firstModelResponse: clearPendingLatencyMetric(latency.firstModelResponse),
        speechToFirstModelResponse: clearPendingLatencyMetric(
          latency.speechToFirstModelResponse,
        ),
      };
    default:
      return latency;
  }
}

export function createSessionControllerStateSync({
  store,
  settingsStore,
  onSpeechLifecycleTransition,
  handleSpeechLifecycleStatusChange,
  updateVoicePlaybackDiagnostics,
  setVoicePlaybackState,
  getVoicePlayback,
  setVoiceToolState,
  resetVoiceToolState,
  clearCurrentVoiceTranscript,
  resetVoiceTurnTranscriptState,
  applyVoiceTranscriptUpdate,
  syncVoiceDurabilityState,
  getNowMs = Date.now,
}: SessionControllerStateSyncArgs) {
  const currentSpeechLifecycleStatus = (): SpeechLifecycleStatus => {
    return store.getState().speechLifecycle.status;
  };

  const syncSpeechSilenceTimeout = (status: SpeechLifecycleStatus): void => {
    handleSpeechLifecycleStatusChange(status);
  };

  const applySpeechLifecycleEvent = (
    event: SpeechSessionLifecycleEvent,
  ): SpeechLifecycleStatus => {
    const sessionStore = store.getState();
    const previousStatus = sessionStore.speechLifecycle.status;
    const nextLifecycle = reduceSpeechSessionLifecycle(sessionStore.speechLifecycle, event);
    const nextLatency = reduceVoiceSessionLatency(
      sessionStore.voiceSessionLatency ?? createDefaultVoiceSessionLatencyState(),
      event,
      getNowMs(),
    );

    if (nextLatency !== sessionStore.voiceSessionLatency) {
      sessionStore.setVoiceSessionLatency(nextLatency);
    }

    if (nextLifecycle.status !== previousStatus) {
      sessionStore.setSpeechLifecycle(nextLifecycle);
      onSpeechLifecycleTransition(previousStatus, nextLifecycle.status, event.type);
      handleSpeechLifecycleStatusChange(nextLifecycle.status);
    }

    return nextLifecycle.status;
  };

  const currentVoiceSessionStatus = (): VoiceSessionStatus => {
    return store.getState().voiceSessionStatus;
  };

  const currentProductMode = (): ProductMode => {
    return store.getState().currentMode;
  };

  const setCurrentMode = (mode: ProductMode): void => {
    store.getState().setCurrentMode(mode);
  };

  const setVoiceSessionStatus = (status: VoiceSessionStatus): void => {
    store.getState().setVoiceSessionStatus(status);
  };

  const setVoiceSessionResumption = (
    patch: Partial<VoiceSessionResumptionState>,
  ): void => {
    store.getState().setVoiceSessionResumption(patch);
  };

  const resetVoiceSessionResumption = (): void => {
    setVoiceSessionResumption(createDefaultVoiceSessionResumptionState());
  };

  const setVoiceSessionDurability = (
    patch: Partial<VoiceSessionDurabilityState>,
  ): void => {
    store.getState().setVoiceSessionDurability(patch);
  };

  const resetVoiceSessionDurability = (): void => {
    store.getState().setVoiceSessionDurability(createDefaultVoiceSessionDurabilityState());
  };

  const createVoiceToolExecutionSnapshot = () => {
    const sessionStore = store.getState();

    return {
      currentMode: sessionStore.currentMode,
      textSessionStatus: sessionStore.textSessionLifecycle.status,
      speechLifecycleStatus: sessionStore.speechLifecycle.status,
      voiceSessionStatus: sessionStore.voiceSessionStatus,
      voiceCaptureState: sessionStore.voiceCaptureState,
      voicePlaybackState: sessionStore.voicePlaybackState,
    };
  };

  const resetVoiceRuntimeState = (): void => {
    resetVoiceToolState();
    clearCurrentVoiceTranscript();
    resetVoiceTurnTranscriptState();
  };

  const hasSpeechLifecycleActivity = (): boolean => {
    return isSpeechLifecycleActive(currentSpeechLifecycleStatus());
  };

  return {
    applySpeechLifecycleEvent,
    applyVoiceTranscriptUpdate,
    clearCurrentVoiceTranscript,
    createVoiceToolExecutionSnapshot,
    currentProductMode,
    currentSpeechLifecycleStatus,
    currentVoiceSessionStatus,
    getVoicePlayback,
    hasSpeechLifecycleActivity,
    resetVoiceRuntimeState,
    resetVoiceSessionDurability,
    resetVoiceSessionResumption,
    resetVoiceToolState,
    resetVoiceTurnTranscriptState,
    setCurrentMode,
    setVoicePlaybackState,
    setVoiceSessionDurability,
    setVoiceSessionResumption,
    setVoiceSessionStatus,
    setVoiceToolState,
    syncSpeechSilenceTimeout,
    syncVoiceDurabilityState,
    updateVoicePlaybackDiagnostics,
    selectedOutputDeviceId: (): string =>
      settingsStore.getState().settings.selectedOutputDeviceId,
  };
}
