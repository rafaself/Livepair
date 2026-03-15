import { Palette, PanelRight, Timer } from 'lucide-react';
import type { AssistantPanelSettingsController } from './settings/useAssistantPanelSettingsController';
import { FieldList } from '../../composite';
import { ViewSection } from '../../layout';
import { Select, Switch, type SelectOptionItem } from '../../primitives';
import { ThemeToggle } from '../ThemeToggle';

const SILENCE_TIMEOUT_OPTIONS: readonly SelectOptionItem[] = [
  { value: 'never', label: 'Never' },
  { value: '30s', label: '30 seconds' },
  { value: '3m', label: '3 minutes' },
];

type PreferencesController = Pick<
  AssistantPanelSettingsController,
  | 'isPanelPinned'
  | 'themePreference'
  | 'speechSilenceTimeout'
  | 'togglePanelPinned'
  | 'setThemePreference'
  | 'setSpeechSilenceTimeout'
>;

export type AssistantPanelPreferencesViewProps = {
  controller: PreferencesController;
};

export function AssistantPanelPreferencesView({
  controller,
}: AssistantPanelPreferencesViewProps): JSX.Element {
  const {
    isPanelPinned,
    themePreference,
    speechSilenceTimeout,
    togglePanelPinned,
    setThemePreference,
    setSpeechSilenceTimeout,
  } = controller;

  return (
    <div className="assistant-panel__settings-modal">
      <h2 className="assistant-panel__settings-title">Preferences</h2>

      <div className="assistant-panel__settings-body">
        <ViewSection icon={Palette} title="Appearance">
          <FieldList
            className="assistant-panel__settings-field-list field-list--aligned-controls"
            items={[
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
            ]}
          />
        </ViewSection>

        <ViewSection icon={PanelRight} title="Layout">
          <FieldList
            className="assistant-panel__settings-field-list field-list--aligned-controls"
            items={[
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

        <ViewSection icon={Timer} title="Session">
          <FieldList
            className="assistant-panel__settings-field-list field-list--aligned-controls"
            items={[
              {
                label: 'Silence timeout',
                value: (
                  <Select
                    aria-label="Silence timeout"
                    className="assistant-panel__settings-select assistant-panel__settings-audio-select"
                    options={SILENCE_TIMEOUT_OPTIONS}
                    value={speechSilenceTimeout}
                    onChange={(event) => {
                      const val = event.target.value;
                      if (val === 'never' || val === '30s' || val === '3m') {
                        setSpeechSilenceTimeout(val);
                      }
                    }}
                    size="sm"
                  />
                ),
              },
            ]}
          />
        </ViewSection>
      </div>
    </div>
  );
}
