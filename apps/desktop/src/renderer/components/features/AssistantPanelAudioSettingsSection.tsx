import { AudioLines } from 'lucide-react';
import type { AssistantPanelSettingsController } from './useAssistantPanelSettingsController';
import { FieldList } from '../composite';
import { ViewSection } from '../layout';
import { Select, Switch, type SelectOptionItem } from '../primitives';

const SPEECH_SILENCE_TIMEOUT_OPTIONS: readonly SelectOptionItem[] = [
  { value: 'never', label: 'Never' },
  { value: '30s', label: '30 seconds' },
  { value: '3m', label: '3 minutes' },
] as const;

type AudioSettingsController = Pick<
  AssistantPanelSettingsController,
  | 'inputDeviceOptions'
  | 'outputDeviceOptions'
  | 'selectedInputDeviceId'
  | 'selectedOutputDeviceId'
  | 'speechSilenceTimeout'
  | 'voiceEchoCancellationEnabled'
  | 'voiceNoiseSuppressionEnabled'
  | 'voiceAutoGainControlEnabled'
  | 'setSelectedInputDeviceId'
  | 'setSelectedOutputDeviceId'
  | 'setSpeechSilenceTimeout'
  | 'setVoiceEchoCancellationEnabled'
  | 'setVoiceNoiseSuppressionEnabled'
  | 'setVoiceAutoGainControlEnabled'
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
    speechSilenceTimeout,
    voiceEchoCancellationEnabled,
    voiceNoiseSuppressionEnabled,
    voiceAutoGainControlEnabled,
    setSelectedInputDeviceId,
    setSelectedOutputDeviceId,
    setSpeechSilenceTimeout,
    setVoiceEchoCancellationEnabled,
    setVoiceNoiseSuppressionEnabled,
    setVoiceAutoGainControlEnabled,
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
          {
            label: 'Silence timeout',
            value: (
              <Select
                aria-label="Silence timeout"
                className="assistant-panel__settings-select assistant-panel__settings-audio-select"
                options={SPEECH_SILENCE_TIMEOUT_OPTIONS}
                value={speechSilenceTimeout}
                onChange={(event) => {
                  if (
                    event.target.value === 'never' ||
                    event.target.value === '30s' ||
                    event.target.value === '3m'
                  ) {
                    setSpeechSilenceTimeout(event.target.value);
                  }
                }}
                size="sm"
              />
            ),
          },
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
        ]}
      />
    </ViewSection>
  );
}
