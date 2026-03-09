import { useEffect } from 'react';
import { AssistantPanelAdvancedSettingsSection } from './AssistantPanelAdvancedSettingsSection';
import { AssistantPanelAudioSettingsSection } from './AssistantPanelAudioSettingsSection';
import { AssistantPanelBackendSettingsSection } from './AssistantPanelBackendSettingsSection';
import { AssistantPanelDisplaySettingsSection } from './AssistantPanelDisplaySettingsSection';
import { AssistantPanelGeneralSettingsSection } from './AssistantPanelGeneralSettingsSection';
import {
  useAssistantPanelSettingsController,
  type AssistantPanelSettingsController,
} from './useAssistantPanelSettingsController';
import { useUiStore } from '../../store/uiStore';

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
        <AssistantPanelDisplaySettingsSection controller={controller} />
        <AssistantPanelAudioSettingsSection controller={controller} />
        <AssistantPanelBackendSettingsSection controller={controller} />
        <AssistantPanelAdvancedSettingsSection controller={controller} />
      </div>
    </div>
  );
}

export function AssistantPanelSettingsView(): JSX.Element {
  const controller = useAssistantPanelSettingsController();
  const refreshDisplayPreferences = useUiStore((state) => state.refreshDisplayPreferences);

  useEffect(() => {
    void refreshDisplayPreferences();
  }, [refreshDisplayPreferences]);

  return <AssistantPanelSettingsContent controller={controller} />;
}
