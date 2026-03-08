import { useEffect, useState } from 'react';
import { Mic, Server, Settings2, Wrench } from 'lucide-react';
import { normalizeBackendBaseUrl } from '../../../shared/backendBaseUrl';
import { FieldList } from '../composite';
import { ViewSection } from '../layout';
import { Select, Switch, TextInput, type SelectOptionItem } from '../primitives';
import { useUiStore } from '../../store/uiStore';

const MODE_OPTIONS: readonly SelectOptionItem[] = [
  { value: 'fast', label: 'Fast' },
  { value: 'thinking', label: 'Thinking' },
];

const DEFAULT_INPUT_DEVICE_ID = 'default';
const UNAVAILABLE_INPUT_OPTION: readonly SelectOptionItem[] = [
  { value: 'unavailable', label: 'No microphone detected' },
];

function buildInputDeviceOptions(devices: MediaDeviceInfo[]): readonly SelectOptionItem[] {
  const audioInputDevices = devices.filter((device) => device.kind === 'audioinput');

  if (audioInputDevices.length === 0) {
    return UNAVAILABLE_INPUT_OPTION;
  }

  let unnamedMicrophoneCount = 0;

  return [
    { value: DEFAULT_INPUT_DEVICE_ID, label: 'System default' },
    ...audioInputDevices.flatMap((device) => {
      if (device.deviceId === DEFAULT_INPUT_DEVICE_ID) {
        return [];
      }

      const label = device.label || `Microphone ${++unnamedMicrophoneCount}`;

      return [{ value: device.deviceId, label }];
    }),
  ];
}

export function AssistantPanelSettingsView(): JSX.Element {
  const {
    state: { backendUrl, isPanelPinned, preferredMode, selectedInputDeviceId },
    togglePanelPinned,
    setPreferredMode,
    setBackendUrl,
    setSelectedInputDeviceId,
  } = useUiStore();
  const [inputDeviceOptions, setInputDeviceOptions] =
    useState<readonly SelectOptionItem[]>(UNAVAILABLE_INPUT_OPTION);
  const [backendUrlDraft, setBackendUrlDraft] = useState(backendUrl);
  const [backendUrlError, setBackendUrlError] = useState<string | null>(null);

  useEffect(() => {
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

        setInputDeviceOptions(buildInputDeviceOptions(devices));
      } catch {
        if (!isDisposed) {
          setInputDeviceOptions(UNAVAILABLE_INPUT_OPTION);
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
  }, []);

  useEffect(() => {
    if (
      inputDeviceOptions[0]?.value === 'unavailable' ||
      inputDeviceOptions.some((option) => option.value === selectedInputDeviceId)
    ) {
      return;
    }

    setSelectedInputDeviceId(DEFAULT_INPUT_DEVICE_ID);
  }, [inputDeviceOptions, selectedInputDeviceId, setSelectedInputDeviceId]);

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

        <ViewSection icon={Mic} title="Audio">
          <FieldList
            className="assistant-panel__settings-field-list field-list--aligned-controls"
            items={[
              {
                label: 'Input device',
                value: (
                  <Select
                    aria-label="Input device"
                    className="assistant-panel__settings-select assistant-panel__settings-input-select"
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
            ]}
          />
        </ViewSection>

        <ViewSection icon={Server} title="Backend">
          <FieldList
            className="assistant-panel__settings-field-list assistant-panel__settings-field-list--stacked"
            items={[
              {
                label: 'Backend URL',
                value: (
                  <TextInput
                    aria-label="Backend URL"
                    className="assistant-panel__settings-backend-input"
                    error={backendUrlError ?? undefined}
                    size="sm"
                    value={backendUrlDraft}
                    onChange={(event) => {
                      setBackendUrlDraft(event.target.value);
                      if (backendUrlError !== null) {
                        setBackendUrlError(null);
                      }
                    }}
                    onBlur={() => {
                      void handleBackendUrlBlur();
                    }}
                  />
                ),
              },
            ]}
          />
        </ViewSection>

        <ViewSection icon={Wrench} title="Advanced">
          <FieldList items={[{ label: 'Debug mode', value: 'Disabled' }]} />
        </ViewSection>
      </div>
    </div>
  );
}
