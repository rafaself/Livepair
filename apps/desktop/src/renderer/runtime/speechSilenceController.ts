import { resolveSpeechSilenceTimeoutMs } from './speechSilenceTimeout';
import type { SpeechLifecycleStatus } from './types';

type SilenceSettingsApi = {
  getState: () => {
    settings: {
      speechSilenceTimeout: string | number;
    };
  };
};

export type SpeechSilenceController = {
  handleStatusChange: (status: SpeechLifecycleStatus) => void;
  syncTimeout: (status: SpeechLifecycleStatus) => void;
  clearAll: () => void;
};

export function createSpeechSilenceController(
  settingsStore: SilenceSettingsApi,
  onTimeout: () => void,
  onRecoveryComplete: () => void,
): SpeechSilenceController {
  let speechRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
  let speechSilenceTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

  const clearRecoveryTimer = (): void => {
    if (speechRecoveryTimer !== null) {
      clearTimeout(speechRecoveryTimer);
      speechRecoveryTimer = null;
    }
  };

  const clearSilenceTimeout = (): void => {
    if (speechSilenceTimeoutTimer !== null) {
      clearTimeout(speechSilenceTimeoutTimer);
      speechSilenceTimeoutTimer = null;
    }
  };

  const syncTimeout = (status: SpeechLifecycleStatus): void => {
    clearSilenceTimeout();

    if (status !== 'listening') {
      return;
    }

    const timeoutMs = resolveSpeechSilenceTimeoutMs(
      settingsStore.getState().settings.speechSilenceTimeout,
    );

    if (timeoutMs === null) {
      return;
    }

    speechSilenceTimeoutTimer = setTimeout(() => {
      speechSilenceTimeoutTimer = null;
      onTimeout();
    }, timeoutMs);
  };

  const handleStatusChange = (status: SpeechLifecycleStatus): void => {
    if (status === 'recovering') {
      clearRecoveryTimer();
      speechRecoveryTimer = setTimeout(() => {
        speechRecoveryTimer = null;
        onRecoveryComplete();
      }, 0);
    } else {
      clearRecoveryTimer();
    }

    syncTimeout(status);
  };

  const clearAll = (): void => {
    clearRecoveryTimer();
    clearSilenceTimeout();
  };

  return { handleStatusChange, syncTimeout, clearAll };
}
