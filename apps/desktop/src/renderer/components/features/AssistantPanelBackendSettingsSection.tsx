import { Server } from 'lucide-react';
import type { AssistantPanelSettingsController } from './useAssistantPanelSettingsController';
import { ViewSection } from '../layout';
import { TextInput } from '../primitives';

type BackendSettingsController = Pick<
  AssistantPanelSettingsController,
  'backendUrlDraft' | 'backendUrlError' | 'handleBackendUrlBlur' | 'handleBackendUrlChange'
>;

export type AssistantPanelBackendSettingsSectionProps = {
  controller: BackendSettingsController;
};

export function AssistantPanelBackendSettingsSection({
  controller,
}: AssistantPanelBackendSettingsSectionProps): JSX.Element {
  const {
    backendUrlDraft,
    backendUrlError,
    handleBackendUrlBlur,
    handleBackendUrlChange,
  } = controller;

  return (
    <ViewSection icon={Server} title="Backend">
      <TextInput
        label="Backend URL"
        className="assistant-panel__settings-backend-input"
        error={backendUrlError ?? undefined}
        size="sm"
        spellCheck={false}
        value={backendUrlDraft}
        onChange={(event) => {
          handleBackendUrlChange(event.target.value);
        }}
        onBlur={() => {
          void handleBackendUrlBlur();
        }}
      />
    </ViewSection>
  );
}
