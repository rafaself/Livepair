import type { AssistantAudioPlayback } from '../../audio/audio.types';
import type {
  VoicePlaybackDiagnostics,
  VoicePlaybackState,
} from '../voice.types';
import type { AssistantAudioPlaybackObserver } from '../../audio/assistantAudioPlayback';

type PlaybackStoreApi = {
  getState: () => {
    setVoicePlaybackState: (state: VoicePlaybackState) => void;
    setVoicePlaybackDiagnostics: (patch: Partial<VoicePlaybackDiagnostics>) => void;
    setAssistantActivity: (activity: 'idle' | 'speaking' | 'thinking') => void;
    setLastRuntimeError: (error: string | null) => void;
  };
};

type PlaybackSettingsApi = {
  getState: () => {
    settings: {
      selectedOutputDeviceId: string;
    };
  };
};

export type VoicePlaybackController = {
  getOrCreate: () => AssistantAudioPlayback;
  stop: (nextState?: VoicePlaybackState) => Promise<void>;
  setState: (state: VoicePlaybackState) => void;
  updateDiagnostics: (patch: Partial<VoicePlaybackDiagnostics>) => void;
  release: () => void;
  isActive: () => boolean;
};

export function createVoicePlaybackController(
  store: PlaybackStoreApi,
  settingsStore: PlaybackSettingsApi,
  createPlayback: (
    observer: AssistantAudioPlaybackObserver,
    options: { selectedOutputDeviceId: string },
  ) => AssistantAudioPlayback,
): VoicePlaybackController {
  let voicePlayback: AssistantAudioPlayback | null = null;

  const updateDiagnostics = (patch: Partial<VoicePlaybackDiagnostics>): void => {
    store.getState().setVoicePlaybackDiagnostics(patch);
  };

  const setState = (state: VoicePlaybackState): void => {
    store.getState().setVoicePlaybackState(state);

    if (state === 'playing' || state === 'buffering') {
      store.getState().setAssistantActivity('speaking');
      return;
    }

    if (state === 'stopped' || state === 'idle' || state === 'error') {
      store.getState().setAssistantActivity('idle');
    }
  };

  const getOrCreate = (): AssistantAudioPlayback => {
    if (!voicePlayback) {
      const selectedOutputDeviceId =
        settingsStore.getState().settings.selectedOutputDeviceId;
      voicePlayback = createPlayback(
        {
          onStateChange: (state) => {
            setState(state);
          },
          onDiagnostics: (diagnostics) => {
            updateDiagnostics(diagnostics);
          },
          onError: (detail) => {
            updateDiagnostics({ lastError: detail });
            setState('error');
            store.getState().setLastRuntimeError(detail);
          },
        },
        { selectedOutputDeviceId },
      );
      updateDiagnostics({ selectedOutputDeviceId });
    }

    return voicePlayback;
  };

  const stop = async (
    nextState: VoicePlaybackState = 'stopped',
  ): Promise<void> => {
    const playback = voicePlayback;
    voicePlayback = null;

    if (!playback) {
      setState(nextState);
      updateDiagnostics({ queueDepth: 0 });
      return;
    }

    setState('stopping');
    await playback.stop();
    setState(nextState);
    updateDiagnostics({ queueDepth: 0 });
  };

  const release = (): void => {
    voicePlayback = null;
  };

  const isActive = (): boolean => {
    return voicePlayback !== null;
  };

  return {
    getOrCreate,
    stop,
    setState,
    updateDiagnostics,
    release,
    isActive,
  };
}
