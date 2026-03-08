import { Mic, Server, Settings2, Wrench } from 'lucide-react';
import { FieldList } from '../composite';
import { ViewSection } from '../layout';
import { Select, Switch, type SelectOptionItem } from '../primitives';
import { useUiStore } from '../../store/uiStore';

const MODE_OPTIONS: readonly SelectOptionItem[] = [
  { value: 'fast', label: 'Fast' },
  { value: 'thinking', label: 'Thinking' },
];

export function AssistantPanelSettingsView(): JSX.Element {
  const {
    state: { isPanelPinned, preferredMode },
    togglePanelPinned,
    setPreferredMode,
  } = useUiStore();

  return (
    <div className="assistant-panel__settings-modal">
      <h2 className="assistant-panel__settings-title">Settings</h2>

      <div className="assistant-panel__settings-body">
        <ViewSection icon={Settings2} title="General">
          <FieldList
            items={[
              {
                label: 'Preferred mode',
                value: (
                  <Select
                    aria-label="Preferred mode"
                    className="assistant-panel__settings-mode-select"
                    options={MODE_OPTIONS}
                    value={preferredMode}
                    onChange={(event) => {
                      if (event.target.value === 'fast' || event.target.value === 'thinking') {
                        setPreferredMode(event.target.value);
                      }
                    }}
                    size="sm"
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

        <ViewSection icon={Mic} title="Audio">
          <FieldList items={[{ label: 'Input device', value: 'Default microphone' }]} />
        </ViewSection>

        <ViewSection icon={Server} title="Backend">
          <FieldList items={[{ label: 'Backend URL', value: 'http://localhost:3000' }]} />
        </ViewSection>

        <ViewSection icon={Wrench} title="Advanced">
          <FieldList items={[{ label: 'Debug mode', value: 'Disabled' }]} />
        </ViewSection>
      </div>
    </div>
  );
}
