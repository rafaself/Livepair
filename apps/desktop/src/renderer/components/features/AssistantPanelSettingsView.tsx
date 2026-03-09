import { useEffect, useState } from 'react';
import { AudioLines, Server, Settings2, Wrench } from 'lucide-react';
import { normalizeBackendBaseUrl } from '../../../shared/backendBaseUrl';
import { FieldList } from '../composite';
import { ViewSection } from '../layout';
import { ThemeToggle } from './ThemeToggle';
import { Select, Switch, TextInput, type SelectOptionItem } from '../primitives';
import { useUiStore } from '../../store/uiStore';

const MODE_OPTIONS: readonly SelectOptionItem[] = [
  { value: 'fast', label: 'Fast' },
  { value: 'thinking', label: 'Thinking' },
];

const DEFAULT_DEVICE_ID = 'default';
const UNAVAILABLE_INPUT_OPTION: readonly SelectOptionItem[] = [
  { value: 'unavailable', label: 'No microphone detected' },
];
const UNAVAILABLE_OUTPUT_OPTION: readonly SelectOptionItem[] = [
  { value: 'unavailable', label: 'No speaker detected' },
];

function buildDeviceOptions(
  devices: MediaDeviceInfo[],
  kind: MediaDeviceKind,
  unavailableOptions: readonly SelectOptionItem[],
  unnamedLabelPrefix: string,
): readonly SelectOptionItem[] {
  const matchingDevices = devices.filter((device) => device.kind === kind);

  if (matchingDevices.length === 0) {
    return unavailableOptions;
  }

  let unnamedDeviceCount = 0;

  return [
    { value: DEFAULT_DEVICE_ID, label: 'System default' },
    ...matchingDevices.flatMap((device) => {
      if (device.deviceId === DEFAULT_DEVICE_ID) {
        return [];
      }

      const label = device.label || `${unnamedLabelPrefix} ${++unnamedDeviceCount}`;

      return [{ value: device.deviceId, label }];
    }),
  ];
}

export type AssistantPanelSettingsController = {
  isDebugMode: boolean;
  isPanelPinned: boolean;
  preferredMode: 'fast' | 'thinking';
  selectedInputDeviceId: string;
  selectedOutputDeviceId: string;
  themePreference: ReturnType<typeof useUiStore>['state']['themePreference'];
  inputDeviceOptions: readonly SelectOptionItem[];
  outputDeviceOptions: readonly SelectOptionItem[];
  backendUrlDraft: string;
  backendUrlError: string | null;
  toggleDebugMode: () => void;
  togglePanelPinned: () => void;
  setPreferredMode: (mode: 'fast' | 'thinking') => void;
  setSelectedInputDeviceId: (deviceId: string) => void;
  setSelectedOutputDeviceId: (deviceId: string) => void;
  setThemePreference: ReturnType<typeof useUiStore>['setThemePreference'];
  handleBackendUrlChange: (value: string) => void;
  handleBackendUrlBlur: () => Promise<void>;
};

export type UseAssistantPanelSettingsControllerOptions = {
  enabled?: boolean;
};

export function useAssistantPanelSettingsController({
  enabled = true,
}: UseAssistantPanelSettingsControllerOptions = {}): AssistantPanelSettingsController {
  const {
    state: {
      backendUrl,
      isDebugMode,
      isPanelPinned,
      preferredMode,
      selectedInputDeviceId,
      selectedOutputDeviceId,
      themePreference,
    },
    toggleDebugMode,
    togglePanelPinned,
    setPreferredMode,
    setBackendUrl,
    setSelectedInputDeviceId,
    setSelectedOutputDeviceId,
    setThemePreference,
  } = useUiStore();
  const [inputDeviceOptions, setInputDeviceOptions] =
    useState<readonly SelectOptionItem[]>(UNAVAILABLE_INPUT_OPTION);
  const [outputDeviceOptions, setOutputDeviceOptions] =
    useState<readonly SelectOptionItem[]>(UNAVAILABLE_OUTPUT_OPTION);
  const [backendUrlDraft, setBackendUrlDraft] = useState(backendUrl);
  const [backendUrlError, setBackendUrlError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isDisposed = false;

    const loadInputDevices = async (): Promise<void> => {
      const mediaDevices = navigator.mediaDevices;

      if (!mediaDevices?.enumerateDevices) {
        if (!isDisposed) {
          setInputDeviceOptions(UNAVAILABLE_INPUT_OPTION);
        }
        return;
      }

      try {
        const devices = await mediaDevices.enumerateDevices();

        if (isDisposed) {
          return;
        }

        setInputDeviceOptions(
          buildDeviceOptions(devices, 'audioinput', UNAVAILABLE_INPUT_OPTION, 'Microphone'),
        );
        setOutputDeviceOptions(
          buildDeviceOptions(devices, 'audiooutput', UNAVAILABLE_OUTPUT_OPTION, 'Speaker'),
        );
      } catch {
        if (!isDisposed) {
          setInputDeviceOptions(UNAVAILABLE_INPUT_OPTION);
          setOutputDeviceOptions(UNAVAILABLE_OUTPUT_OPTION);
        }
      }
    };

    void loadInputDevices();

    const handleDeviceChange = (): void => {
      void loadInputDevices();
    };

    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);

    return () => {
      isDisposed = true;
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
    };
  }, [enabled]);

  useEffect(() => {
    if (
      inputDeviceOptions[0]?.value === 'unavailable' ||
      inputDeviceOptions.some((option) => option.value === selectedInputDeviceId)
    ) {
      return;
    }

    setSelectedInputDeviceId(DEFAULT_DEVICE_ID);
  }, [inputDeviceOptions, selectedInputDeviceId, setSelectedInputDeviceId]);

  useEffect(() => {
    if (
      outputDeviceOptions[0]?.value === 'unavailable' ||
      outputDeviceOptions.some((option) => option.value === selectedOutputDeviceId)
    ) {
      return;
    }

    setSelectedOutputDeviceId(DEFAULT_DEVICE_ID);
  }, [outputDeviceOptions, selectedOutputDeviceId, setSelectedOutputDeviceId]);

  useEffect(() => {
    setBackendUrlDraft(backendUrl);
  }, [backendUrl]);

  const handleBackendUrlBlur = async (): Promise<void> => {
    const normalizedBackendUrl = normalizeBackendBaseUrl(backendUrlDraft);

    if (!normalizedBackendUrl) {
      setBackendUrlError('Enter a valid http:// or https:// URL.');
      return;
    }

    try {
      const appliedBackendUrl = normalizeBackendBaseUrl(
        await window.bridge.setBackendBaseUrl(normalizedBackendUrl),
      ) ?? normalizedBackendUrl;

      setBackendUrl(appliedBackendUrl);
      setBackendUrlDraft(appliedBackendUrl);
      setBackendUrlError(null);
    } catch {
      setBackendUrlDraft(backendUrl);
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
