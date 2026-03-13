import { normalizeBackendBaseUrl } from '../../../shared/backendBaseUrl';
import type {
  PreferredMode,
  SpeechSilenceTimeout,
  ThemePreference,
} from '../../../shared/settings';
import { useSettingsStore } from '../../store/settingsStore';
import { useUiStore } from '../../store/uiStore';
import type { SelectOptionItem } from '../primitives';

const UNAVAILABLE_INPUT_OPTION: readonly SelectOptionItem[] = [
  { value: 'unavailable', label: 'Voice input unavailable in text-only release' },
];
const UNAVAILABLE_OUTPUT_OPTION: readonly SelectOptionItem[] = [
  { value: 'unavailable', label: 'Voice output unavailable in text-only release' },
];

export type AssistantPanelSettingsController = {
  isDebugMode: boolean;
  isPanelPinned: boolean;
  preferredMode: PreferredMode;
  selectedInputDeviceId: string;
  selectedOutputDeviceId: string;
  speechSilenceTimeout: SpeechSilenceTimeout;
  voiceEchoCancellationEnabled: boolean;
  voiceNoiseSuppressionEnabled: boolean;
  voiceAutoGainControlEnabled: boolean;
  themePreference: ThemePreference;
  inputDeviceOptions: readonly SelectOptionItem[];
  outputDeviceOptions: readonly SelectOptionItem[];
  backendUrlDraft: string;
  backendUrlError: string | null;
  toggleDebugMode: () => void;
  togglePanelPinned: () => void;
  setPreferredMode: (mode: PreferredMode) => void;
  setSelectedInputDeviceId: (deviceId: string) => void;
  setSelectedOutputDeviceId: (deviceId: string) => void;
  setSpeechSilenceTimeout: (timeout: SpeechSilenceTimeout) => void;
  setVoiceEchoCancellationEnabled: (enabled: boolean) => void;
  setVoiceNoiseSuppressionEnabled: (enabled: boolean) => void;
  setVoiceAutoGainControlEnabled: (enabled: boolean) => void;
  setThemePreference: (themePreference: ThemePreference) => void;
  handleBackendUrlChange: (value: string) => void;
  handleBackendUrlBlur: () => Promise<void>;
};

type UseAssistantPanelSettingsControllerOptions = {
  enabled?: boolean;
};

export function useAssistantPanelSettingsController({
  enabled: _enabled = true,
}: UseAssistantPanelSettingsControllerOptions = {}): AssistantPanelSettingsController {
  const settings = useSettingsStore((state) => state.settings);
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const isDebugMode = useUiStore((state) => state.isDebugMode);
  const toggleDebugMode = useUiStore((state) => state.toggleDebugMode);
  const backendUrlDraft = useUiStore((state) => state.backendUrlDraft);
  const backendUrlError = useUiStore((state) => state.backendUrlError);
  const setBackendUrlDraft = useUiStore((state) => state.setBackendUrlDraft);
  const setBackendUrlError = useUiStore((state) => state.setBackendUrlError);
  const resolvedBackendUrlDraft = backendUrlDraft || settings.backendUrl;

  const handleBackendUrlBlur = async (): Promise<void> => {
    const normalizedBackendUrl = normalizeBackendBaseUrl(resolvedBackendUrlDraft);

    if (!normalizedBackendUrl) {
      setBackendUrlError('Enter a valid http:// or https:// URL.');
      return;
    }

    try {
      const nextSettings = await updateSettings({
        backendUrl: normalizedBackendUrl,
      });

      setBackendUrlDraft(nextSettings.backendUrl);
      setBackendUrlError(null);
    } catch {
      setBackendUrlDraft(settings.backendUrl);
      setBackendUrlError('Unable to update backend URL.');
    }
  };

  const handleBackendUrlChange = (value: string): void => {
    setBackendUrlDraft(value);
    if (backendUrlError !== null) {
      setBackendUrlError(null);
    }
  };

  return {
    isDebugMode,
    isPanelPinned: settings.isPanelPinned,
    preferredMode: settings.preferredMode,
    selectedInputDeviceId: settings.selectedInputDeviceId,
    selectedOutputDeviceId: settings.selectedOutputDeviceId,
    speechSilenceTimeout: settings.speechSilenceTimeout,
    voiceEchoCancellationEnabled: settings.voiceEchoCancellationEnabled,
    voiceNoiseSuppressionEnabled: settings.voiceNoiseSuppressionEnabled,
    voiceAutoGainControlEnabled: settings.voiceAutoGainControlEnabled,
    themePreference: settings.themePreference,
    inputDeviceOptions: UNAVAILABLE_INPUT_OPTION,
    outputDeviceOptions: UNAVAILABLE_OUTPUT_OPTION,
    backendUrlDraft: resolvedBackendUrlDraft,
    backendUrlError,
    toggleDebugMode,
    togglePanelPinned: () => {
      void updateSetting('isPanelPinned', !settings.isPanelPinned);
    },
    setPreferredMode: (preferredMode) => {
      void updateSetting('preferredMode', preferredMode);
    },
    setSelectedInputDeviceId: (selectedInputDeviceId) => {
      void updateSetting('selectedInputDeviceId', selectedInputDeviceId);
    },
    setSelectedOutputDeviceId: (selectedOutputDeviceId) => {
      void updateSetting('selectedOutputDeviceId', selectedOutputDeviceId);
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
    handleBackendUrlChange,
    handleBackendUrlBlur,
  };
}
