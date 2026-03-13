import { Settings2 } from 'lucide-react';
import type { AssistantPanelSettingsController } from './useAssistantPanelSettingsController';
import { FieldList } from '../../../composite';
import { ViewSection } from '../../../layout';
import { Select, Switch, type SelectOptionItem } from '../../../primitives';
import { ThemeToggle } from '../../ThemeToggle';

const MODE_OPTIONS: readonly SelectOptionItem[] = [
  { value: 'fast', label: 'Fast' },
];

type GeneralSettingsController = Pick<
  AssistantPanelSettingsController,
  | 'isDebugMode'
  | 'isPanelPinned'
  | 'preferredMode'
  | 'themePreference'
  | 'togglePanelPinned'
  | 'setPreferredMode'
  | 'setThemePreference'
>;

export type AssistantPanelGeneralSettingsSectionProps = {
  controller: GeneralSettingsController;
};

export function AssistantPanelGeneralSettingsSection({
  controller,
}: AssistantPanelGeneralSettingsSectionProps): JSX.Element {
  const {
    isDebugMode,
    isPanelPinned,
    preferredMode,
    themePreference,
    togglePanelPinned,
    setPreferredMode,
    setThemePreference,
  } = controller;

  return (
    <ViewSection icon={Settings2} title="General">
      <FieldList
        className="assistant-panel__settings-field-list field-list--aligned-controls"
        items={[
          ...(isDebugMode
            ? [
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
              ]
            : []),
          {
            label: 'Theme',
            value: (
              <ThemeToggle
                className="assistant-panel__settings-theme-toggle"
                size="sm"
                value={themePreference}
                onChange={setThemePreference}
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
  );
}
