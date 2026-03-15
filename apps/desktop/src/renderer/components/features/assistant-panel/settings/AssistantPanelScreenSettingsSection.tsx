import { Monitor } from 'lucide-react';
import type { VisualSessionQuality } from '../../../../../shared';
import type { AssistantPanelSettingsController } from './useAssistantPanelSettingsController';
import { FieldList } from '../../../composite';
import { ViewSection } from '../../../layout';
import { Select, Tooltip, type SelectOptionItem } from '../../../primitives';

const VISUAL_QUALITY_OPTIONS: readonly SelectOptionItem[] = [
  { value: 'Low', label: 'Low' },
  { value: 'Medium', label: 'Medium' },
  { value: 'High', label: 'High' },
];

type ScreenSettingsController = Pick<
  AssistantPanelSettingsController,
  | 'screenCaptureSourceOptions'
  | 'selectedScreenCaptureSourceId'
  | 'setSelectedScreenCaptureSourceId'
  | 'visualSessionQuality'
  | 'setVisualSessionQuality'
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
    visualSessionQuality,
    setVisualSessionQuality,
  } = controller;

  return (
    <ViewSection icon={Monitor} title="Video">
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
                Frame quality
                <Tooltip content="Higher quality may increase latency and cost." />
              </span>
            ),
            value: (
              <Select
                aria-label="Frame quality"
                className="assistant-panel__settings-select"
                options={VISUAL_QUALITY_OPTIONS}
                value={visualSessionQuality}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === 'Low' || value === 'Medium' || value === 'High') {
                    setVisualSessionQuality(value as VisualSessionQuality);
                  }
                }}
                size="sm"
              />
            ),
          },
        ]}
      />
    </ViewSection>
  );
}
