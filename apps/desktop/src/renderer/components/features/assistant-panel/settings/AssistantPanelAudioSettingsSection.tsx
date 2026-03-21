import { AudioLines } from 'lucide-react';
import type { AssistantPanelSettingsController } from './useAssistantPanelSettingsController';
import { FieldList } from '../../../composite';
import { ViewSection } from '../../../layout';
import { Select, Switch } from '../../../primitives';

type AudioSettingsController = Pick<
  AssistantPanelSettingsController,
  | 'inputDeviceOptions'
  | 'outputDeviceOptions'
  | 'selectedInputDeviceId'
  | 'selectedOutputDeviceId'
  | 'voiceEchoCancellationEnabled'
  | 'voiceNoiseSuppressionEnabled'
  | 'voiceAutoGainControlEnabled'
  | 'refreshDevices'
  | 'setSelectedInputDeviceId'
  | 'setSelectedOutputDeviceId'
  | 'setVoiceEchoCancellationEnabled'
  | 'setVoiceNoiseSuppressionEnabled'
  | 'setVoiceAutoGainControlEnabled'
  | 'isDebugMode'
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
    voiceEchoCancellationEnabled,
    voiceNoiseSuppressionEnabled,
    voiceAutoGainControlEnabled,
    refreshDevices,
    setSelectedInputDeviceId,
    setSelectedOutputDeviceId,
    setVoiceEchoCancellationEnabled,
    setVoiceNoiseSuppressionEnabled,
    setVoiceAutoGainControlEnabled,
    isDebugMode,
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
                onOpen={refreshDevices}
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
                onOpen={refreshDevices}
                disabled={isOutputUnavailable}
                size="sm"
              />
            ),
          },
          ...(isDebugMode
            ? [
                {
                  label: 'Echo cancellation',
                  value: (
                    <Switch
                      aria-label="Echo cancellation"
                      checked={voiceEchoCancellationEnabled}
                      className="assistant-panel__settings-switch"
                      onCheckedChange={setVoiceEchoCancellationEnabled}
                    />
                  ),
                },
                {
                  label: 'Noise suppression',
                  value: (
                    <Switch
                      aria-label="Noise suppression"
                      checked={voiceNoiseSuppressionEnabled}
                      className="assistant-panel__settings-switch"
                      onCheckedChange={setVoiceNoiseSuppressionEnabled}
                    />
                  ),
                },
                {
                  label: 'Auto gain control',
                  value: (
                    <Switch
                      aria-label="Auto gain control"
                      checked={voiceAutoGainControlEnabled}
                      className="assistant-panel__settings-switch"
                      onCheckedChange={setVoiceAutoGainControlEnabled}
                    />
                  ),
                },
              ]
            : []),
        ]}
      />
    </ViewSection>
  );
}
