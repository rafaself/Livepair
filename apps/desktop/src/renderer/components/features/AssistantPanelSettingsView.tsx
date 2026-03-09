import { AudioLines, Server, Settings2, Wrench } from 'lucide-react';
import { normalizeBackendBaseUrl } from '../../../shared/backendBaseUrl';
import type { ThemePreference } from '../../../shared/settings';
import { FieldList } from '../composite';
import { ViewSection } from '../layout';
import { ThemeToggle } from './ThemeToggle';
import { Select, Switch, TextInput, type SelectOptionItem } from '../primitives';
import { useUiStore } from '../../store/uiStore';
import { useSettingsStore } from '../../store/settingsStore';

const MODE_OPTIONS: readonly SelectOptionItem[] = [
  { value: 'fast', label: 'Fast' },
  { value: 'thinking', label: 'Thinking' },
];

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

export type AssistantPanelSettingsContentProps = {
  controller: AssistantPanelSettingsController;
};

export function AssistantPanelSettingsContent({
  controller,
}: AssistantPanelSettingsContentProps): JSX.Element {
  const {
    isDebugMode,
    isPanelPinned,
    preferredMode,
    selectedInputDeviceId,
    selectedOutputDeviceId,
    themePreference,
    inputDeviceOptions,
    outputDeviceOptions,
    backendUrlDraft,
    backendUrlError,
    toggleDebugMode,
    togglePanelPinned,
    setPreferredMode,
    setSelectedInputDeviceId,
    setSelectedOutputDeviceId,
    setThemePreference,
    handleBackendUrlChange,
    handleBackendUrlBlur,
  } = controller;

  return (
    <div className="assistant-panel__settings-modal">
      <h2 className="assistant-panel__settings-title">Settings</h2>

      <div className="assistant-panel__settings-body">
        <ViewSection icon={Settings2} title="General">
          <FieldList
            className="assistant-panel__settings-field-list field-list--aligned-controls"
            items={[
              {
                label: 'Preferred mode',
                value: (
                  <Select
                    aria-label="Preferred mode"
                    className="assistant-panel__settings-select assistant-panel__settings-mode-select"
                    options={MODE_OPTIONS}
                    value={preferredMode}
                    onChange={(event) => {
                      if (event.target.value === 'fast' || event.target.value === 'thinking') {
                        setPreferredMode(event.target.value);
                      }
                    }}
                    size="sm"
                  />
                ),
              },
              {
                label: 'Theme',
                value: (
                  <ThemeToggle
                    className="assistant-panel__settings-theme-toggle"
                    size="sm"
                    value={themePreference}
                    onChange={setThemePreference}
                  />
                ),
              },
              {
                label: 'Lock panel',
                value: (
                  <Switch
                    aria-label="Lock panel"
                    checked={isPanelPinned}
                    className="assistant-panel__settings-switch"
                    onCheckedChange={() => togglePanelPinned()}
                  />
                ),
              },
            ]}
          />
        </ViewSection>

        <ViewSection icon={AudioLines} title="Audio">
          <FieldList
            className="assistant-panel__settings-field-list field-list--aligned-controls"
            items={[
              {
                label: 'Input device',
                value: (
                  <Select
                    aria-label="Input device"
                    className="assistant-panel__settings-select assistant-panel__settings-audio-select assistant-panel__settings-input-select"
                    options={inputDeviceOptions}
                    value={
                      inputDeviceOptions[0]?.value === 'unavailable'
                        ? 'unavailable'
                        : selectedInputDeviceId
                    }
                    onChange={(event) => {
                      setSelectedInputDeviceId(event.target.value);
                    }}
                    disabled={inputDeviceOptions[0]?.value === 'unavailable'}
                    size="sm"
                  />
                ),
              },
              {
                label: 'Output device',
                value: (
                  <Select
                    aria-label="Output device"
                    className="assistant-panel__settings-select assistant-panel__settings-audio-select assistant-panel__settings-output-select"
                    options={outputDeviceOptions}
                    value={
                      outputDeviceOptions[0]?.value === 'unavailable'
                        ? 'unavailable'
                        : selectedOutputDeviceId
                    }
                    onChange={(event) => {
                      setSelectedOutputDeviceId(event.target.value);
                    }}
                    disabled={outputDeviceOptions[0]?.value === 'unavailable'}
                    size="sm"
                  />
                ),
              },
            ]}
          />
        </ViewSection>

        <ViewSection icon={Server} title="Backend">
          <TextInput
            label="Backend URL"
            className="assistant-panel__settings-backend-input"
            error={backendUrlError ?? undefined}
            size="sm"
            spellCheck={false}
            value={backendUrlDraft}
            onChange={(event) => {
              handleBackendUrlChange(event.target.value);
            }}
            onBlur={() => {
              void handleBackendUrlBlur();
            }}
          />
        </ViewSection>

        <ViewSection icon={Wrench} title="Advanced">
          <FieldList
            className="assistant-panel__settings-field-list field-list--aligned-controls"
            items={[
              {
                label: 'Debug mode',
                value: (
                  <Switch
                    aria-label="Debug mode"
                    checked={isDebugMode}
                    className="assistant-panel__settings-switch"
                    onCheckedChange={() => toggleDebugMode()}
                  />
                ),
              },
            ]}
          />
        </ViewSection>
      </div>
    </div>
  );
}

export function AssistantPanelSettingsView(): JSX.Element {
  const controller = useAssistantPanelSettingsController();

  return <AssistantPanelSettingsContent controller={controller} />;
}
