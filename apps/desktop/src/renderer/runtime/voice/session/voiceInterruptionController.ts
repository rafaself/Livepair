import type { AssistantActivityState } from '../../core/session.types';
import type { DesktopSession } from '../../transport/transport.types';
import type {
  VoiceCaptureState,
  VoiceSessionStatus,
} from '../voice.types';
import type { SessionEvent } from '../../core/session.types';

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
  applySessionEvent: (
    event: Extract<
      SessionEvent,
      { type: 'turn.recovery.started' } | { type: 'turn.recovery.completed' }
    >,
  ) => void,
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
        applySessionEvent({ type: 'turn.recovery.started' });
        return;
      }

      applySessionEvent({ type: 'turn.recovery.completed' });
    })();
  };

  const reset = (): void => {
    inFlight = null;
    sequence += 1;
  };

  return { handle, reset };
}
