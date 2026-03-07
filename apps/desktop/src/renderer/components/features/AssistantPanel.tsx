import { useState, type ChangeEvent } from 'react';
import {
  ASSISTANT_PANEL_STATE_LABELS,
  ASSISTANT_RUNTIME_STATES,
  ASSISTANT_RUNTIME_STATE_LABELS,
  type AssistantPanelState,
  type AssistantRuntimeState,
} from '../../state/assistantUiState';
import { StatusIndicator } from '../composite';
import { OverlayContainer, Panel, PanelFooter, PanelHeader, PanelSection } from '../layout';
import { Button, Modal } from '../primitives';
import './AssistantPanel.css';

export type AssistantPanelProps = {
  panelState: AssistantPanelState;
  showStateDevControls?: boolean;
};

export function AssistantPanel({
  panelState,
  showStateDevControls = false,
}: AssistantPanelProps): JSX.Element {
  const isOpen = panelState === 'expanded';
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [runtimeState, setRuntimeState] = useState<AssistantRuntimeState>('disconnected');

  function handleActionTriggered(): void {
    console.log('action triggered');
  }

  function handleOpenSettings(): void {
    setIsSettingsOpen(true);
  }

  function handleCloseSettings(): void {
    setIsSettingsOpen(false);
  }

  function handleRuntimeStateChange(event: ChangeEvent<HTMLSelectElement>): void {
    const selectedState = ASSISTANT_RUNTIME_STATES.find(
      (state) => state === event.target.value,
    );

    if (selectedState) {
      setRuntimeState(selectedState);
    }
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
                <StatusIndicator state={runtimeState} size="sm" />
                <span>{ASSISTANT_RUNTIME_STATE_LABELS[runtimeState]}</span>
              </div>
            </div>
            <div className="assistant-panel__status-item">
              <p className="assistant-panel__status-label">Panel</p>
              <div className="assistant-panel__status-value">
                <span>{ASSISTANT_PANEL_STATE_LABELS[panelState]}</span>
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

          {showStateDevControls ? (
            <div className="assistant-panel__dev-controls">
              <label
                htmlFor="assistant-runtime-state"
                className="assistant-panel__dev-label"
              >
                Assistant runtime state
              </label>
              <select
                id="assistant-runtime-state"
                className="assistant-panel__dev-select"
                value={runtimeState}
                onChange={handleRuntimeStateChange}
              >
                {ASSISTANT_RUNTIME_STATES.map((state) => (
                  <option key={state} value={state}>
                    {ASSISTANT_RUNTIME_STATE_LABELS[state]}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
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

      <Modal isOpen={isSettingsOpen} onClose={handleCloseSettings} ariaLabel="Settings">
        <div className="assistant-panel__settings-modal">
          <header className="assistant-panel__settings-header">
            <h2 className="assistant-panel__settings-title">Settings</h2>
            <Button variant="secondary" onClick={handleCloseSettings}>
              Close settings
            </Button>
          </header>

          <div className="assistant-panel__settings-body">
            <section className="assistant-panel__settings-section" aria-label="General">
              <h3 className="assistant-panel__settings-section-title">General</h3>
              <dl className="assistant-panel__settings-list">
                <div className="assistant-panel__settings-item">
                  <dt className="assistant-panel__settings-label">Preferred mode</dt>
                  <dd className="assistant-panel__settings-value">Fast</dd>
                </div>
              </dl>
            </section>

            <section className="assistant-panel__settings-section" aria-label="Audio">
              <h3 className="assistant-panel__settings-section-title">Audio</h3>
              <dl className="assistant-panel__settings-list">
                <div className="assistant-panel__settings-item">
                  <dt className="assistant-panel__settings-label">Input device</dt>
                  <dd className="assistant-panel__settings-value">Default microphone</dd>
                </div>
              </dl>
            </section>

            <section className="assistant-panel__settings-section" aria-label="Backend">
              <h3 className="assistant-panel__settings-section-title">Backend</h3>
              <dl className="assistant-panel__settings-list">
                <div className="assistant-panel__settings-item">
                  <dt className="assistant-panel__settings-label">Backend URL</dt>
                  <dd className="assistant-panel__settings-value">http://localhost:3000</dd>
                </div>
              </dl>
            </section>

            <section className="assistant-panel__settings-section" aria-label="Advanced">
              <h3 className="assistant-panel__settings-section-title">Advanced</h3>
              <dl className="assistant-panel__settings-list">
                <div className="assistant-panel__settings-item">
                  <dt className="assistant-panel__settings-label">Debug mode</dt>
                  <dd className="assistant-panel__settings-value">Disabled</dd>
                </div>
              </dl>
            </section>
          </div>
        </div>
      </Modal>
    </OverlayContainer>
  );
}
