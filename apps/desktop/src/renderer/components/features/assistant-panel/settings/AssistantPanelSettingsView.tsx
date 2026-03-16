import { AssistantPanelAdvancedSettingsSection } from './AssistantPanelAdvancedSettingsSection';
import { AssistantPanelAudioSettingsSection } from './AssistantPanelAudioSettingsSection';
import { AssistantPanelScreenSettingsSection } from './AssistantPanelScreenSettingsSection';
import {
  useAssistantPanelSettingsController,
  type AssistantPanelSettingsController,
} from './useAssistantPanelSettingsController';

export type AssistantPanelSettingsContentProps = {
  controller: AssistantPanelSettingsController;
};

export function AssistantPanelSettingsContent({
  controller,
}: AssistantPanelSettingsContentProps): JSX.Element {
  return (
    <div className="assistant-panel__settings-modal">
      <h2 className="assistant-panel__settings-title">Settings</h2>

      <div className="assistant-panel__settings-body">
        <AssistantPanelScreenSettingsSection controller={controller} />
        <AssistantPanelAudioSettingsSection controller={controller} />
        <AssistantPanelAdvancedSettingsSection controller={controller} />
      </div>
    </div>
  );
}

export function AssistantPanelSettingsView(): JSX.Element {
  const controller = useAssistantPanelSettingsController();

  return <AssistantPanelSettingsContent controller={controller} />;
}
