import { OverlayContainer, Panel, PanelFooter, PanelHeader } from '../layout';
import { Button } from '../primitives';
import { AssistantPanelActionsSection } from './AssistantPanelActionsSection';
import { AssistantPanelSessionSection } from './AssistantPanelSessionSection';
import { AssistantPanelSettingsModal } from './AssistantPanelSettingsModal';
import { AssistantPanelStatusSection } from './AssistantPanelStatusSection';
import { useAssistantPanelController } from './useAssistantPanelController';
import './AssistantPanel.css';

export type AssistantPanelProps = {
  showStateDevControls?: boolean;
};

export function AssistantPanel({
  showStateDevControls = false,
}: AssistantPanelProps): JSX.Element {
  const panel = useAssistantPanelController();
  const {
    assistantState,
    isPanelOpen,
    isSettingsOpen,
    closePanel,
    openSettings,
    closeSettings,
    backendState,
    backendIndicatorState,
    backendLabel,
    tokenRequestState,
    tokenFeedback,
    handleCheckBackendHealth,
    handleConnect,
    setAssistantState,
  } = panel;

  function handleActionTriggered(): void {
    console.log('action triggered');
  }

  return (
    <OverlayContainer>
      <Panel
        id="assistant-panel"
        role="complementary"
        aria-label="Assistant Panel"
        aria-hidden={!isPanelOpen}
        isOpen={isPanelOpen}
        className="assistant-panel"
      >
        <PanelHeader title="Livepair">
          <Button variant="secondary" size="sm" onClick={closePanel}>
            Close panel
          </Button>
        </PanelHeader>

        <AssistantPanelStatusSection
          assistantState={assistantState}
          isPanelOpen={isPanelOpen}
          backendState={backendState}
          backendIndicatorState={backendIndicatorState}
          backendLabel={backendLabel}
          showStateDevControls={showStateDevControls}
          onRetryBackendHealth={handleCheckBackendHealth}
          onSetAssistantState={setAssistantState}
        />

        <AssistantPanelSessionSection />

        <AssistantPanelActionsSection
          tokenRequestState={tokenRequestState}
          tokenFeedback={tokenFeedback}
          onConnect={handleConnect}
          onStartListening={handleActionTriggered}
        />

        <PanelFooter>
          <Button variant="secondary" onClick={openSettings}>
            Settings
          </Button>
        </PanelFooter>
      </Panel>

      <AssistantPanelSettingsModal isOpen={isSettingsOpen} onClose={closeSettings} />
    </OverlayContainer>
  );
}
