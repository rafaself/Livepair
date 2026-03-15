import { Settings2 } from 'lucide-react';
import type { AssistantPanelSettingsController } from './useAssistantPanelSettingsController';
import { FieldList } from '../../../composite';
import { ViewSection } from '../../../layout';
import { Select, type SelectOptionItem } from '../../../primitives';

const MODE_OPTIONS: readonly SelectOptionItem[] = [
  { value: 'fast', label: 'Fast' },
];

type GeneralSettingsController = Pick<
  AssistantPanelSettingsController,
  | 'isDebugMode'
  | 'preferredMode'
  | 'setPreferredMode'
>;

export type AssistantPanelGeneralSettingsSectionProps = {
  controller: GeneralSettingsController;
};

export function AssistantPanelGeneralSettingsSection({
  controller,
}: AssistantPanelGeneralSettingsSectionProps): JSX.Element | null {
  const { isDebugMode, preferredMode, setPreferredMode } = controller;

  if (!isDebugMode) {
    return null;
  }

  return (
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
                  if (event.target.value === 'fast') {
                    setPreferredMode(event.target.value);
                  }
                }}
                disabled
                size="sm"
              />
            ),
          },
        ]}
      />
    </ViewSection>
  );
}
