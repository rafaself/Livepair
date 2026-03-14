import { AssistantPanelAdvancedSettingsSection } from './AssistantPanelAdvancedSettingsSection';
import { AssistantPanelAudioSettingsSection } from './AssistantPanelAudioSettingsSection';
import { AssistantPanelBackendSettingsSection } from './AssistantPanelBackendSettingsSection';
import { AssistantPanelGeneralSettingsSection } from './AssistantPanelGeneralSettingsSection';
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
        <AssistantPanelGeneralSettingsSection controller={controller} />
        <AssistantPanelScreenSettingsSection controller={controller} />
        <AssistantPanelAudioSettingsSection controller={controller} />
        <AssistantPanelAdvancedSettingsSection controller={controller} />
        {controller.isDebugMode && (
          <div className="assistant-panel__settings-section-reveal">
            <AssistantPanelBackendSettingsSection controller={controller} />
          </div>
        )}
      </div>
    </div>
  );
}

export function AssistantPanelSettingsView(): JSX.Element {
  const controller = useAssistantPanelSettingsController();

  return <AssistantPanelSettingsContent controller={controller} />;
}
