import { normalizeBackendBaseUrl } from '../../../shared/backendBaseUrl';
import type { ThemePreference } from '../../../shared/settings';
import { useSettingsStore } from '../../store/settingsStore';
import { useUiStore } from '../../store/uiStore';
import type { SelectOptionItem } from '../primitives';

const UNAVAILABLE_INPUT_OPTION: readonly SelectOptionItem[] = [
  { value: 'unavailable', label: 'No microphone detected' },
];
const UNAVAILABLE_OUTPUT_OPTION: readonly SelectOptionItem[] = [
  { value: 'unavailable', label: 'No speaker detected' },
];

export type AssistantPanelSettingsController = {
  isDebugMode: boolean;
  isPanelPinned: boolean;
  preferredMode: 'fast' | 'thinking';
  selectedInputDeviceId: string;
  selectedOutputDeviceId: string;
  themePreference: ThemePreference;
  inputDeviceOptions: readonly SelectOptionItem[];
  outputDeviceOptions: readonly SelectOptionItem[];
  backendUrlDraft: string;
  backendUrlError: string | null;
  toggleDebugMode: () => void;
  togglePanelPinned: () => void;
  setPreferredMode: (mode: 'fast' | 'thinking') => void;
  setSelectedInputDeviceId: (deviceId: string) => void;
  setSelectedOutputDeviceId: (deviceId: string) => void;
  setThemePreference: (themePreference: ThemePreference) => void;
  handleBackendUrlChange: (value: string) => void;
  handleBackendUrlBlur: () => Promise<void>;
};

export type UseAssistantPanelSettingsControllerOptions = {
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
  const inputDeviceOptions = useUiStore((state) =>
    state.inputDeviceOptions.length > 0 ? state.inputDeviceOptions : UNAVAILABLE_INPUT_OPTION,
  );
  const outputDeviceOptions = useUiStore((state) =>
    state.outputDeviceOptions.length > 0 ? state.outputDeviceOptions : UNAVAILABLE_OUTPUT_OPTION,
  );
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
    themePreference: settings.themePreference,
    inputDeviceOptions,
    outputDeviceOptions,
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
    setThemePreference: (themePreference) => {
      void updateSetting('themePreference', themePreference);
    },
    handleBackendUrlChange,
    handleBackendUrlBlur,
  };
}
