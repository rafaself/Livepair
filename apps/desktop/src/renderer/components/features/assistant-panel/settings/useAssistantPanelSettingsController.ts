import { useEffect, useMemo } from 'react';
import type {
  ChatTimestampVisibility,
  ContinuousScreenQuality,
  DesktopVoice,
  ScreenContextMode,
  SpeechSilenceTimeout,
  ThemePreference,
} from '../../../../../shared';
import { DEFAULT_DESKTOP_SETTINGS } from '../../../../../shared';
import { invalidateCurrentLiveSessionResumption } from '../../../../liveSessions/currentLiveSession';
import {
  useDomainRuntimeCommands,
  useDomainRuntimeHostState,
} from '../../../../runtime/domainRuntimeContract';
import { useSettingsStore } from '../../../../store/settingsStore';
import { useSessionStore } from '../../../../store/sessionStore';
import { useUiStore } from '../../../../store/uiStore';
import type { SelectOptionItem } from '../../../primitives';

const UNAVAILABLE_INPUT_OPTION: readonly SelectOptionItem[] = [
  { value: 'unavailable', label: 'No voice input devices available' },
];
const UNAVAILABLE_OUTPUT_OPTION: readonly SelectOptionItem[] = [
  { value: 'unavailable', label: 'No voice output devices available' },
];
const UNSELECTED_SCREEN_CAPTURE_SOURCE_VALUE = '';
const GROUNDING_CHANGE_DETAIL =
  'Grounding setting changed; start a new session to apply it.';
const VOICE_CHANGE_DETAIL =
  'Voice setting changed; start a new session to apply it.';
const ASSISTANT_INSTRUCTIONS_CHANGE_DETAIL =
  'Assistant instructions changed; start a new session to apply them.';

export type AssistantPanelSettingsController = {
  isDebugMode: boolean;
  isPanelPinned: boolean;
  selectedInputDeviceId: string;
  selectedOutputDeviceId: string;
  speechSilenceTimeout: SpeechSilenceTimeout;
  voiceEchoCancellationEnabled: boolean;
  voiceNoiseSuppressionEnabled: boolean;
  voiceAutoGainControlEnabled: boolean;
  themePreference: ThemePreference;
  screenContextMode: ScreenContextMode;
  continuousScreenQuality: ContinuousScreenQuality;
  chatTimestampVisibility: ChatTimestampVisibility;
  groundingEnabled: boolean;
  voice: DesktopVoice;
  systemInstruction: string;
  inputDeviceOptions: readonly SelectOptionItem[];
  outputDeviceOptions: readonly SelectOptionItem[];
  screenCaptureSourceOptions: readonly SelectOptionItem[];
  selectedScreenCaptureSourceId: string;
  refreshDevices: () => void;
  toggleDebugMode: () => void;
  togglePanelPinned: () => void;
  setSelectedInputDeviceId: (deviceId: string) => void;
  setSelectedOutputDeviceId: (deviceId: string) => void;
  setSelectedScreenCaptureSourceId: (sourceId: string) => void;
  setSpeechSilenceTimeout: (timeout: SpeechSilenceTimeout) => void;
  setVoiceEchoCancellationEnabled: (enabled: boolean) => void;
  setVoiceNoiseSuppressionEnabled: (enabled: boolean) => void;
  setVoiceAutoGainControlEnabled: (enabled: boolean) => void;
  setThemePreference: (themePreference: ThemePreference) => void;
  setScreenContextMode: (mode: Exclude<ScreenContextMode, 'unconfigured'>) => void;
  setContinuousScreenQuality: (quality: ContinuousScreenQuality) => void;
  setChatTimestampVisibility: (visibility: ChatTimestampVisibility) => void;
  setGroundingEnabled: (enabled: boolean) => void;
  setVoice: (voice: DesktopVoice) => void;
  setSystemInstruction: (systemInstruction: string) => void;
  restoreDefaultVoiceAndInstructions: () => void;
};

export function useAssistantPanelSettingsController(): AssistantPanelSettingsController {
  const settings = useSettingsStore((state) => state.settings);
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const isDebugMode = useUiStore((state) => state.isDebugMode);
  const inputDeviceOptions = useUiStore((state) => state.inputDeviceOptions);
  const outputDeviceOptions = useUiStore((state) => state.outputDeviceOptions);
  const toggleDebugMode = useUiStore((state) => state.toggleDebugMode);
  const refreshDevices = useUiStore((state) => state.refreshDevices);
  const activeChatId = useSessionStore((state) => state.activeChatId);
  const { screenCaptureSources, selectedScreenCaptureSourceId } = useDomainRuntimeHostState();
  const {
    refreshScreenCaptureSources,
    selectScreenCaptureSource,
  } = useDomainRuntimeCommands();
  const setLastRuntimeError = useSessionStore((state) => state.setLastRuntimeError);
  const invalidateActiveSpeechSessionResumption = async (detail: string): Promise<void> => {
    if (useSessionStore.getState().currentMode !== 'speech') {
      return;
    }

    useSessionStore.getState().setVoiceSessionResumption({
      resumable: false,
      lastDetail: detail,
    });
    await invalidateCurrentLiveSessionResumption(detail);
  };
  const invalidateFutureSessionConfigChange = async (
    nextSettings: Pick<typeof settings, 'voice' | 'systemInstruction'>,
  ): Promise<void> => {
    const voiceChanged = nextSettings.voice !== settings.voice;
    const systemInstructionChanged =
      nextSettings.systemInstruction !== settings.systemInstruction;

    if (!voiceChanged && !systemInstructionChanged) {
      return;
    }

    await invalidateActiveSpeechSessionResumption(
      systemInstructionChanged
        ? ASSISTANT_INSTRUCTIONS_CHANGE_DETAIL
        : VOICE_CHANGE_DETAIL,
    );
  };
  const screenCaptureSourceOptions = useMemo(
    () =>
      screenCaptureSources.map((source) => ({
        value: source.id,
        label: source.name,
      })),
    [screenCaptureSources],
  );

  useEffect(() => {
    void refreshScreenCaptureSources();
  }, [activeChatId, refreshScreenCaptureSources]);

  return {
    isDebugMode,
    isPanelPinned: settings.isPanelPinned,
    selectedInputDeviceId: settings.selectedInputDeviceId,
    selectedOutputDeviceId: settings.selectedOutputDeviceId,
    speechSilenceTimeout: settings.speechSilenceTimeout,
    voiceEchoCancellationEnabled: settings.voiceEchoCancellationEnabled,
    voiceNoiseSuppressionEnabled: settings.voiceNoiseSuppressionEnabled,
    voiceAutoGainControlEnabled: settings.voiceAutoGainControlEnabled,
    themePreference: settings.themePreference,
    screenContextMode: settings.screenContextMode,
    continuousScreenQuality: settings.continuousScreenQuality,
    chatTimestampVisibility: settings.chatTimestampVisibility,
    groundingEnabled: settings.groundingEnabled,
    voice: settings.voice,
    systemInstruction: settings.systemInstruction,
    inputDeviceOptions:
      inputDeviceOptions.length > 0 ? inputDeviceOptions : UNAVAILABLE_INPUT_OPTION,
    outputDeviceOptions:
      outputDeviceOptions.length > 0 ? outputDeviceOptions : UNAVAILABLE_OUTPUT_OPTION,
    screenCaptureSourceOptions,
    selectedScreenCaptureSourceId:
      selectedScreenCaptureSourceId ?? UNSELECTED_SCREEN_CAPTURE_SOURCE_VALUE,
    refreshDevices,
    toggleDebugMode,
    togglePanelPinned: () => {
      void updateSetting('isPanelPinned', !settings.isPanelPinned);
    },
    setSelectedInputDeviceId: (selectedInputDeviceId) => {
      void updateSetting('selectedInputDeviceId', selectedInputDeviceId);
    },
    setSelectedOutputDeviceId: (selectedOutputDeviceId) => {
      void updateSetting('selectedOutputDeviceId', selectedOutputDeviceId);
    },
    setSelectedScreenCaptureSourceId: (sourceId) => {
      const nextSourceId =
        sourceId === UNSELECTED_SCREEN_CAPTURE_SOURCE_VALUE ? null : sourceId;

      void selectScreenCaptureSource(nextSourceId);
    },
    setSpeechSilenceTimeout: (speechSilenceTimeout) => {
      void updateSetting('speechSilenceTimeout', speechSilenceTimeout);
    },
    setVoiceEchoCancellationEnabled: (voiceEchoCancellationEnabled) => {
      void updateSetting('voiceEchoCancellationEnabled', voiceEchoCancellationEnabled);
    },
    setVoiceNoiseSuppressionEnabled: (voiceNoiseSuppressionEnabled) => {
      void updateSetting('voiceNoiseSuppressionEnabled', voiceNoiseSuppressionEnabled);
    },
    setVoiceAutoGainControlEnabled: (voiceAutoGainControlEnabled) => {
      void updateSetting('voiceAutoGainControlEnabled', voiceAutoGainControlEnabled);
    },
    setThemePreference: (themePreference) => {
      void updateSetting('themePreference', themePreference);
    },
    setScreenContextMode: (screenContextMode) => {
      void updateSetting('screenContextMode', screenContextMode);
    },
    setContinuousScreenQuality: (continuousScreenQuality) => {
      void updateSetting('continuousScreenQuality', continuousScreenQuality);
    },
    setChatTimestampVisibility: (chatTimestampVisibility) => {
      void updateSetting('chatTimestampVisibility', chatTimestampVisibility);
    },
    setGroundingEnabled: (groundingEnabled) => {
      if (groundingEnabled === settings.groundingEnabled) {
        return;
      }

      void updateSetting('groundingEnabled', groundingEnabled)
        .then(async () => {
          await invalidateActiveSpeechSessionResumption(GROUNDING_CHANGE_DETAIL);
        })
        .catch((error: unknown) => {
          setLastRuntimeError(
            error instanceof Error && error.message.length > 0
              ? error.message
              : 'Failed to update grounding preference',
          );
        });
    },
    setVoice: (voice) => {
      if (voice === settings.voice) {
        return;
      }

      void updateSetting('voice', voice)
        .then(async (nextSettings) => {
          await invalidateFutureSessionConfigChange({
            voice: nextSettings.voice,
            systemInstruction: nextSettings.systemInstruction,
          });
        })
        .catch((error: unknown) => {
          setLastRuntimeError(
            error instanceof Error && error.message.length > 0
              ? error.message
              : 'Failed to update voice preference',
          );
        });
    },
    setSystemInstruction: (systemInstruction) => {
      void updateSetting('systemInstruction', systemInstruction)
        .then(async (nextSettings) => {
          await invalidateFutureSessionConfigChange({
            voice: nextSettings.voice,
            systemInstruction: nextSettings.systemInstruction,
          });
        })
        .catch((error: unknown) => {
          setLastRuntimeError(
            error instanceof Error && error.message.length > 0
              ? error.message
              : 'Failed to update assistant instructions',
          );
        });
    },
    restoreDefaultVoiceAndInstructions: () => {
      if (
        settings.voice === DEFAULT_DESKTOP_SETTINGS.voice
        && settings.systemInstruction === DEFAULT_DESKTOP_SETTINGS.systemInstruction
      ) {
        return;
      }

      void updateSettings({
        voice: DEFAULT_DESKTOP_SETTINGS.voice,
        systemInstruction: DEFAULT_DESKTOP_SETTINGS.systemInstruction,
      })
        .then(async (nextSettings) => {
          await invalidateFutureSessionConfigChange({
            voice: nextSettings.voice,
            systemInstruction: nextSettings.systemInstruction,
          });
        })
        .catch((error: unknown) => {
          setLastRuntimeError(
            error instanceof Error && error.message.length > 0
              ? error.message
              : 'Failed to restore assistant defaults',
          );
        });
    },
  };
}
