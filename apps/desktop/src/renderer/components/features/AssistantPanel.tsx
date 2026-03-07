import { StatusIndicator } from '../composite';
import { OverlayContainer, Panel, PanelFooter, PanelHeader, PanelSection } from '../layout';
import { Button } from '../primitives';
import './AssistantPanel.css';

export type AssistantPanelProps = {
  isOpen: boolean;
};

export function AssistantPanel({
  isOpen,
}: AssistantPanelProps): JSX.Element {
  function handleActionTriggered(): void {
    console.log('action triggered');
  }

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
        <PanelHeader title="Livepair" />

        <PanelSection title="Status">
          <div className="assistant-panel__status-list">
            <div className="assistant-panel__status-item">
              <p className="assistant-panel__status-label">Assistant</p>
              <div className="assistant-panel__status-value">
                <StatusIndicator state="disconnected" size="sm" />
                <span>Disconnected</span>
              </div>
            </div>
            <div className="assistant-panel__status-item">
              <p className="assistant-panel__status-label">Backend</p>
              <div className="assistant-panel__status-value">
                <StatusIndicator state="disconnected" size="sm" />
                <span>Not connected</span>
              </div>
            </div>
          </div>
        </PanelSection>

        <PanelSection title="Session" className="assistant-panel__session">
          <dl className="assistant-panel__session-list">
            <div className="assistant-panel__session-item">
              <dt className="assistant-panel__session-label">Mode</dt>
              <dd className="assistant-panel__session-value">Fast</dd>
            </div>
            <div className="assistant-panel__session-item">
              <dt className="assistant-panel__session-label">Goal</dt>
              <dd className="assistant-panel__session-value">
                Assist with desktop tasks
              </dd>
            </div>
            <div className="assistant-panel__session-item">
              <dt className="assistant-panel__session-label">Transcript</dt>
              <dd className="assistant-panel__session-value">
                (No conversation yet)
              </dd>
            </div>
          </dl>
        </PanelSection>

        <PanelSection title="Actions">
          <div className="assistant-panel__actions">
            <Button variant="primary" onClick={handleActionTriggered}>
              Connect
            </Button>
            <Button variant="secondary" onClick={handleActionTriggered}>
              Start Listening
            </Button>
          </div>
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
