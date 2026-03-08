import { useEffect, useState } from 'react';
import { Mic, Server, Settings2, Wrench } from 'lucide-react';
import { FieldList } from '../composite';
import { ViewSection } from '../layout';
import { Select, Switch, type SelectOptionItem } from '../primitives';
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
    state: { isPanelPinned, preferredMode, selectedInputDeviceId },
    togglePanelPinned,
    setPreferredMode,
    setSelectedInputDeviceId,
  } = useUiStore();
  const [inputDeviceOptions, setInputDeviceOptions] =
    useState<readonly SelectOptionItem[]>(UNAVAILABLE_INPUT_OPTION);

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

  return (
    <div className="assistant-panel__settings-modal">
      <h2 className="assistant-panel__settings-title">Settings</h2>

      <div className="assistant-panel__settings-body">
        <ViewSection icon={Settings2} title="General">
          <FieldList
            items={[
              {
                label: 'Preferred mode',
                value: (
                  <Select
                    aria-label="Preferred mode"
                    className="assistant-panel__settings-mode-select"
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
            items={[
              {
                label: 'Input device',
                value: (
                  <Select
                    aria-label="Input device"
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
          <FieldList items={[{ label: 'Backend URL', value: 'http://localhost:3000' }]} />
        </ViewSection>

        <ViewSection icon={Wrench} title="Advanced">
          <FieldList items={[{ label: 'Debug mode', value: 'Disabled' }]} />
        </ViewSection>
      </div>
    </div>
  );
}
