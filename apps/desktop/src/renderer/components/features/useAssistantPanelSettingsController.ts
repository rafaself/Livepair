import { normalizeBackendBaseUrl } from '../../../shared/backendBaseUrl';
import { PRIMARY_DISPLAY_ID, type ThemePreference } from '../../../shared/settings';
import { useSettingsStore } from '../../store/settingsStore';
import { useUiStore } from '../../store/uiStore';
import type { SelectOptionItem } from '../primitives';

const UNAVAILABLE_INPUT_OPTION: readonly SelectOptionItem[] = [
  { value: 'unavailable', label: 'No microphone detected' },
];
const UNAVAILABLE_OUTPUT_OPTION: readonly SelectOptionItem[] = [
  { value: 'unavailable', label: 'No speaker detected' },
];
const PRIMARY_DISPLAY_OPTION: SelectOptionItem = {
  value: PRIMARY_DISPLAY_ID,
  label: 'Primary display',
};

function buildDisplaySelectOptions(
  displayOptions: readonly {
    id: string;
    label: string;
  }[],
  selectedDisplayId: string,
): readonly SelectOptionItem[] {
  const options: SelectOptionItem[] = [
    PRIMARY_DISPLAY_OPTION,
    ...displayOptions.map((display) => ({
      value: display.id,
      label: display.label,
    })),
  ];

  if (
    selectedDisplayId !== PRIMARY_DISPLAY_ID &&
    !options.some((option) => option.value === selectedDisplayId)
  ) {
    options.push({
      value: selectedDisplayId,
      label: 'Saved display unavailable',
      tooltip: `Missing display id: ${selectedDisplayId}`,
    });
  }

  return options;
}

export type AssistantPanelSettingsController = {
  isDebugMode: boolean;
  isPanelPinned: boolean;
  preferredMode: 'fast' | 'thinking';
  selectedInputDeviceId: string;
  selectedOutputDeviceId: string;
  selectedCaptureDisplayId: string;
  selectedOverlayDisplayId: string;
  themePreference: ThemePreference;
  inputDeviceOptions: readonly SelectOptionItem[];
  outputDeviceOptions: readonly SelectOptionItem[];
  captureDisplayOptions: readonly SelectOptionItem[];
  overlayDisplayOptions: readonly SelectOptionItem[];
  backendUrlDraft: string;
  backendUrlError: string | null;
  displayIssueSummaries: readonly string[];
  toggleDebugMode: () => void;
  togglePanelPinned: () => void;
  setPreferredMode: (mode: 'fast' | 'thinking') => void;
  setSelectedInputDeviceId: (deviceId: string) => void;
  setSelectedOutputDeviceId: (deviceId: string) => void;
  setSelectedCaptureDisplayId: (displayId: string) => void;
  setSelectedOverlayDisplayId: (displayId: string) => void;
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
  const refreshDisplayPreferences = useUiStore((state) => state.refreshDisplayPreferences);
  const displayOptions = useUiStore((state) => state.displayOptions);
  const settingsIssues = useUiStore((state) => state.settingsIssues);
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

  const updateDisplaySetting = (key: 'selectedCaptureDisplayId' | 'selectedOverlayDisplayId') => {
    return (value: string): void => {
      void updateSetting(key, value).then(() => refreshDisplayPreferences());
    };
  };

  return {
    isDebugMode,
    isPanelPinned: settings.isPanelPinned,
    preferredMode: settings.preferredMode,
    selectedInputDeviceId: settings.selectedInputDeviceId,
    selectedOutputDeviceId: settings.selectedOutputDeviceId,
    selectedCaptureDisplayId: settings.selectedCaptureDisplayId,
    selectedOverlayDisplayId: settings.selectedOverlayDisplayId,
    themePreference: settings.themePreference,
    inputDeviceOptions,
    outputDeviceOptions,
    captureDisplayOptions: buildDisplaySelectOptions(
      displayOptions,
      settings.selectedCaptureDisplayId,
    ),
    overlayDisplayOptions: buildDisplaySelectOptions(
      displayOptions,
      settings.selectedOverlayDisplayId,
    ),
    backendUrlDraft: resolvedBackendUrlDraft,
    backendUrlError,
    displayIssueSummaries: settingsIssues.map((issue) => issue.summary),
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
    setSelectedCaptureDisplayId: updateDisplaySetting('selectedCaptureDisplayId'),
    setSelectedOverlayDisplayId: updateDisplaySetting('selectedOverlayDisplayId'),
    setThemePreference: (themePreference) => {
      void updateSetting('themePreference', themePreference);
    },
    handleBackendUrlChange,
    handleBackendUrlBlur,
  };
}
