import { useCallback, useEffect, useState } from 'react';
import {
  ASSISTANT_RUNTIME_STATES,
  ASSISTANT_RUNTIME_STATE_LABELS,
  type AssistantRuntimeState,
} from '../../state/assistantUiState';
import { checkBackendHealth, requestSessionToken } from '../../api/backend';
import { useUiStore } from '../../store/uiStore';
import { StatusIndicator } from '../composite';
import { OverlayContainer, Panel, PanelFooter, PanelHeader, PanelSection } from '../layout';
import { Button, Modal } from '../primitives';
import './AssistantPanel.css';

export type AssistantPanelProps = {
  showStateDevControls?: boolean;
};

type BackendConnectionState = 'idle' | 'checking' | 'connected' | 'failed';
type TokenRequestState = 'idle' | 'loading' | 'success' | 'error';

export function AssistantPanel({
  showStateDevControls = false,
}: AssistantPanelProps): JSX.Element {
  const {
    state: { assistantState, isPanelOpen, isSettingsOpen },
    closePanel,
    openSettings,
    closeSettings,
    setAssistantState,
  } = useUiStore();
  const [backendState, setBackendState] = useState<BackendConnectionState>('idle');
  const [tokenRequestState, setTokenRequestState] = useState<TokenRequestState>('idle');

  function handleActionTriggered(): void {
    console.log('action triggered');
  }

  const handleCheckBackendHealth = useCallback(async (): Promise<void> => {
    setBackendState('checking');
    const isHealthy = await checkBackendHealth();
    setBackendState(isHealthy ? 'connected' : 'failed');
  }, []);

  useEffect(() => {
    if (!isPanelOpen) {
      return;
    }

    void handleCheckBackendHealth();
  }, [handleCheckBackendHealth, isPanelOpen]);

  async function handleConnect(): Promise<void> {
    setTokenRequestState('loading');
    try {
      await requestSessionToken();
      setTokenRequestState('success');
    } catch {
      setTokenRequestState('error');
    }
  }

  function handleSetAssistantState(nextState: AssistantRuntimeState): void {
    setAssistantState(nextState);
  }

  const backendIndicatorState: AssistantRuntimeState =
    backendState === 'connected'
      ? 'ready'
      : backendState === 'checking'
        ? 'connecting'
        : 'disconnected';

  const backendLabel =
    backendState === 'connected'
      ? 'Connected'
      : backendState === 'checking'
        ? 'Checking backend...'
        : 'Not connected';

  const tokenFeedback =
    tokenRequestState === 'loading'
      ? 'Requesting token...'
      : tokenRequestState === 'success'
        ? 'Token received'
        : tokenRequestState === 'error'
          ? 'Connection failed'
          : null;

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

        <PanelSection title="Status">
          <div className="assistant-panel__status-list">
            <div className="assistant-panel__status-item">
              <p className="assistant-panel__status-label">Assistant</p>
              <div className="assistant-panel__status-value">
                <StatusIndicator state={assistantState} size="sm" />
                <span>{ASSISTANT_RUNTIME_STATE_LABELS[assistantState]}</span>
              </div>
            </div>
            <div className="assistant-panel__status-item">
              <p className="assistant-panel__status-label">Panel</p>
              <div className="assistant-panel__status-value">
                <span>{isPanelOpen ? 'Open' : 'Closed'}</span>
              </div>
            </div>
            <div className="assistant-panel__status-item">
              <p className="assistant-panel__status-label">Backend</p>
              <div className="assistant-panel__status-actions">
                <div className="assistant-panel__status-value">
                  <StatusIndicator state={backendIndicatorState} size="sm" />
                  <span>{backendLabel}</span>
                </div>
                {backendState === 'failed' ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleCheckBackendHealth()}
                  >
                    Retry
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          {showStateDevControls ? (
            <div className="assistant-panel__dev-controls">
              <p className="assistant-panel__dev-label">Set state:</p>
              <div className="assistant-panel__dev-buttons">
                {ASSISTANT_RUNTIME_STATES.map((state) => (
                  <Button
                    key={state}
                    variant={assistantState === state ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => handleSetAssistantState(state)}
                  >
                    {state}
                  </Button>
                ))}
              </div>
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
            <Button
              variant="primary"
              onClick={() => void handleConnect()}
              disabled={tokenRequestState === 'loading'}
            >
              Connect
            </Button>
            <Button variant="secondary" onClick={handleActionTriggered}>
              Start Listening
            </Button>
          </div>
          {tokenFeedback ? (
            <p className="assistant-panel__actions-feedback" role="status" aria-live="polite">
              {tokenFeedback}
            </p>
          ) : null}
        </PanelSection>

        <PanelFooter>
          <Button variant="secondary" onClick={openSettings}>
            Settings
          </Button>
        </PanelFooter>
      </Panel>

      <Modal isOpen={isSettingsOpen} onClose={closeSettings} ariaLabel="Settings">
        <div className="assistant-panel__settings-modal">
          <header className="assistant-panel__settings-header">
            <h2 className="assistant-panel__settings-title">Settings</h2>
            <Button variant="secondary" onClick={closeSettings}>
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
