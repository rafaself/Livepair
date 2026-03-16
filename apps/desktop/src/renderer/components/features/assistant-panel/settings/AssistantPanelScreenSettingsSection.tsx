import { Monitor } from 'lucide-react';
import type { AssistantPanelSettingsController } from './useAssistantPanelSettingsController';
import { FieldList } from '../../../composite';
import { ViewSection } from '../../../layout';
import { Select, Tooltip, type SelectOptionItem } from '../../../primitives';

const SCREEN_CONTEXT_MODE_OPTIONS: readonly SelectOptionItem[] = [
  { value: 'manual', label: 'Manual' },
  { value: 'continuous', label: 'Continuous' },
];

const CONTINUOUS_SCREEN_QUALITY_OPTIONS: readonly SelectOptionItem[] = [
  { value: 'low', label: 'low' },
  { value: 'medium', label: 'medium' },
  { value: 'high', label: 'high' },
];

type ScreenSettingsController = Pick<
  AssistantPanelSettingsController,
  | 'screenCaptureSourceOptions'
  | 'selectedScreenCaptureSourceId'
  | 'setSelectedScreenCaptureSourceId'
  | 'screenContextMode'
  | 'setScreenContextMode'
  | 'continuousScreenQuality'
  | 'setContinuousScreenQuality'
>;

export type AssistantPanelScreenSettingsSectionProps = {
  controller: ScreenSettingsController;
};

export function AssistantPanelScreenSettingsSection({
  controller,
}: AssistantPanelScreenSettingsSectionProps): JSX.Element {
  const {
    screenCaptureSourceOptions,
    selectedScreenCaptureSourceId,
    setSelectedScreenCaptureSourceId,
    screenContextMode,
    setScreenContextMode,
    continuousScreenQuality,
    setContinuousScreenQuality,
  } = controller;
  const configuredScreenContextMode =
    screenContextMode === 'unconfigured' ? '' : screenContextMode;

  return (
    <ViewSection icon={Monitor} title="Share Screen">
      <FieldList
        className="assistant-panel__settings-field-list field-list--aligned-controls"
        items={[
          {
            label: 'Screen source',
            value: (
              <Select
                aria-label="Screen source"
                className="assistant-panel__settings-select assistant-panel__settings-audio-select"
                options={screenCaptureSourceOptions}
                value={selectedScreenCaptureSourceId}
                onChange={(event) => {
                  setSelectedScreenCaptureSourceId(event.target.value);
                }}
                size="sm"
              />
            ),
          },
          {
            label: (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                Mode
                <Tooltip content="Choose how Share Screen should send your screen." />
              </span>
            ),
            value: (
              <div className="assistant-panel__settings-field-stack">
                <Select
                  aria-label="Screen mode"
                  className="assistant-panel__settings-select assistant-panel__settings-audio-select"
                  options={SCREEN_CONTEXT_MODE_OPTIONS}
                  value={configuredScreenContextMode}
                  placeholder="Choose mode"
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === 'manual' || value === 'continuous') {
                      setScreenContextMode(value);
                    }
                  }}
                  size="sm"
                />
                <span className="assistant-panel__settings-hint">
                  {screenContextMode === 'manual'
                    ? 'Manual mode always sends in High quality when you click Send screen now.'
                    : screenContextMode === 'continuous'
                      ? 'Continuous mode uses the automatic screen quality below.'
                      : null}
                </span>
              </div>
            ),
          },
          ...(screenContextMode === 'continuous'
            ? [
                {
                  label: (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      Automatic quality
                      <Tooltip content="Higher quality may increase latency and cost." />
                    </span>
                  ),
                  value: (
                    <Select
                      aria-label="Automatic screen quality"
                      className="assistant-panel__settings-select assistant-panel__settings-audio-select"
                      options={CONTINUOUS_SCREEN_QUALITY_OPTIONS}
                      value={continuousScreenQuality}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value === 'low' || value === 'medium' || value === 'high') {
                          setContinuousScreenQuality(value);
                        }
                      }}
                      size="sm"
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
