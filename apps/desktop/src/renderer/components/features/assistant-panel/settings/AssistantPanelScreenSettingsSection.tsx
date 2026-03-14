import { Monitor } from 'lucide-react';
import type { AssistantPanelSettingsController } from './useAssistantPanelSettingsController';
import { FieldList } from '../../../composite';
import { ViewSection } from '../../../layout';
import { Select } from '../../../primitives';

type ScreenSettingsController = Pick<
  AssistantPanelSettingsController,
  | 'screenCaptureSourceOptions'
  | 'selectedScreenCaptureSourceId'
  | 'setSelectedScreenCaptureSourceId'
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
  } = controller;

  return (
    <ViewSection icon={Monitor} title="Screen context">
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
        ]}
      />
    </ViewSection>
  );
}
