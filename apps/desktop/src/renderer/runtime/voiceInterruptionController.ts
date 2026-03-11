import type {
  AssistantActivityState,
  DesktopSession,
  VoiceCaptureState,
  VoiceSessionStatus,
} from './types';
import type { SpeechSessionLifecycleEvent } from './speechSessionLifecycle';

type InterruptionStoreApi = {
  getState: () => {
    voiceCaptureState: VoiceCaptureState;
    setAssistantActivity: (activity: AssistantActivityState) => void;
  };
};

export type VoiceInterruptionController = {
  handle: () => void;
  reset: () => void;
};

export function createVoiceInterruptionController(
  store: InterruptionStoreApi,
  getTransport: () => DesktopSession | null,
  getCurrentVoiceSessionStatus: () => VoiceSessionStatus,
  setVoiceSessionStatus: (status: VoiceSessionStatus) => void,
  applySpeechLifecycleEvent: (event: SpeechSessionLifecycleEvent) => void,
  stopPlayback: () => Promise<void>,
): VoiceInterruptionController {
  let inFlight: Promise<void> | null = null;
  let sequence = 0;

  const handle = (): void => {
    if (inFlight) {
      return;
    }

    sequence += 1;
    const capturedSequence = sequence;
    setVoiceSessionStatus('interrupted');
    applySpeechLifecycleEvent({ type: 'interruption.detected' });
    store.getState().setAssistantActivity('idle');

    inFlight = (async () => {
      try {
        await stopPlayback();
      } catch {
        // Ignore playback teardown errors while recovering from interruption.
      }

      if (sequence !== capturedSequence) {
        return;
      }

      inFlight = null;

      if (!getTransport() || getCurrentVoiceSessionStatus() !== 'interrupted') {
        return;
      }

      if (store.getState().voiceCaptureState === 'capturing') {
        setVoiceSessionStatus('recovering');
        applySpeechLifecycleEvent({ type: 'recovery.started' });
        return;
      }

      setVoiceSessionStatus('ready');
      applySpeechLifecycleEvent({ type: 'recovery.completed' });
    })();
  };

  const reset = (): void => {
    inFlight = null;
    sequence += 1;
  };

  return { handle, reset };
}
