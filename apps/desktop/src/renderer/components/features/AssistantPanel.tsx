import { StatusIndicator } from '../composite';
import { OverlayContainer, Panel, PanelFooter, PanelHeader, PanelSection } from '../layout';
import { Button, IconButton } from '../primitives';
import './AssistantPanel.css';

export type AssistantPanelProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function AssistantPanel({
  isOpen,
  onClose,
}: AssistantPanelProps): JSX.Element {
  function handleOpenSettings(): void {
    console.log('open settings');
  }

  return (
    <OverlayContainer>
      <Panel
        id="assistant-panel"
        role="complementary"
        aria-label="Assistant Panel"
        aria-hidden={!isOpen}
        isOpen={isOpen}
        className="assistant-panel"
      >
        <PanelHeader title="Livepair">
          <IconButton label="Close assistant panel" size="sm" onClick={onClose}>
            X
          </IconButton>
        </PanelHeader>

        <PanelSection title="Status">
          <div className="assistant-panel__status-list">
            <div className="assistant-panel__status-item">
              <p className="assistant-panel__status-label">Assistant Status</p>
              <div className="assistant-panel__status-value">
                <StatusIndicator state="disconnected" size="sm" />
                <span>Disconnected</span>
              </div>
            </div>
            <div className="assistant-panel__status-item">
              <p className="assistant-panel__status-label">Connection</p>
              <div className="assistant-panel__status-value">
                <StatusIndicator state="disconnected" size="sm" />
                <span>Not connected</span>
              </div>
            </div>
          </div>
        </PanelSection>

        <PanelSection title="Main" className="assistant-panel__main">
          <p className="assistant-panel__copy">Assistant will appear here.</p>
          <p className="assistant-panel__copy">Future controls:</p>
          <ul className="assistant-panel__future-list">
            <li>microphone</li>
            <li>transcript</li>
            <li>actions</li>
          </ul>
        </PanelSection>

        <PanelFooter>
          <Button variant="secondary" onClick={handleOpenSettings}>
            Settings
          </Button>
        </PanelFooter>
      </Panel>
    </OverlayContainer>
  );
}
