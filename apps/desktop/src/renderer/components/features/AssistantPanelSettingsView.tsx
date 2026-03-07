import { Mic, Server, Settings2, Wrench } from 'lucide-react';
import { FieldList } from '../composite';
import { ViewSection } from '../layout';

export function AssistantPanelSettingsView(): JSX.Element {
  return (
    <div className="assistant-panel__settings-modal">
      <h2 className="assistant-panel__settings-title">Settings</h2>

      <div className="assistant-panel__settings-body">
        <ViewSection icon={Settings2} title="General">
          <FieldList items={[{ label: 'Preferred mode', value: 'Fast' }]} />
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
