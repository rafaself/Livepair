import { Wrench } from 'lucide-react';
import type { AssistantPanelSettingsController } from './useAssistantPanelSettingsController';
import { FieldList } from '../composite';
import { ViewSection } from '../layout';
import { Switch } from '../primitives';

type AdvancedSettingsController = Pick<
  AssistantPanelSettingsController,
  'isDebugMode' | 'toggleDebugMode'
>;

export type AssistantPanelAdvancedSettingsSectionProps = {
  controller: AdvancedSettingsController;
};

export function AssistantPanelAdvancedSettingsSection({
  controller,
}: AssistantPanelAdvancedSettingsSectionProps): JSX.Element {
  const { isDebugMode, toggleDebugMode } = controller;

  return (
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
  );
}
