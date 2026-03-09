import { AudioLines } from 'lucide-react';
import type { AssistantPanelSettingsController } from './useAssistantPanelSettingsController';
import { FieldList } from '../composite';
import { ViewSection } from '../layout';
import { Select } from '../primitives';

type AudioSettingsController = Pick<
  AssistantPanelSettingsController,
  | 'inputDeviceOptions'
  | 'outputDeviceOptions'
  | 'selectedInputDeviceId'
  | 'selectedOutputDeviceId'
  | 'setSelectedInputDeviceId'
  | 'setSelectedOutputDeviceId'
>;

export type AssistantPanelAudioSettingsSectionProps = {
  controller: AudioSettingsController;
};

export function AssistantPanelAudioSettingsSection({
  controller,
}: AssistantPanelAudioSettingsSectionProps): JSX.Element {
  const {
    inputDeviceOptions,
    outputDeviceOptions,
    selectedInputDeviceId,
    selectedOutputDeviceId,
    setSelectedInputDeviceId,
    setSelectedOutputDeviceId,
  } = controller;
  const isInputUnavailable = inputDeviceOptions[0]?.value === 'unavailable';
  const isOutputUnavailable = outputDeviceOptions[0]?.value === 'unavailable';

  return (
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
                value={isInputUnavailable ? 'unavailable' : selectedInputDeviceId}
                onChange={(event) => {
                  setSelectedInputDeviceId(event.target.value);
                }}
                disabled={isInputUnavailable}
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
                value={isOutputUnavailable ? 'unavailable' : selectedOutputDeviceId}
                onChange={(event) => {
                  setSelectedOutputDeviceId(event.target.value);
                }}
                disabled={isOutputUnavailable}
                size="sm"
              />
            ),
          },
        ]}
      />
    </ViewSection>
  );
}
