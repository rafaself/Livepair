import {
  ASSISTANT_RUNTIME_STATES,
  ASSISTANT_RUNTIME_STATE_LABELS,
  type AssistantRuntimeState,
} from '../../state/assistantUiState';
import { StatusIndicator } from '../composite';
import { Button, Modal } from '../primitives';
import type { BackendConnectionState } from './useAssistantPanelController';

export type AssistantPanelDebugModalProps = {
  isOpen: boolean;
  assistantState: AssistantRuntimeState;
  backendState: BackendConnectionState;
  backendIndicatorState: AssistantRuntimeState;
  backendLabel: string;
  tokenFeedback: string | null;
  onClose: () => void;
  onRetryBackendHealth: () => Promise<void>;
  onSetAssistantState: (state: AssistantRuntimeState) => void;
};

export function AssistantPanelDebugModal({
  isOpen,
  assistantState,
  backendState,
  backendIndicatorState,
  backendLabel,
  tokenFeedback,
  onClose,
  onRetryBackendHealth,
  onSetAssistantState,
}: AssistantPanelDebugModalProps): JSX.Element {
  return (
    <Modal isOpen={isOpen} onClose={onClose} ariaLabel="Developer tools">
      <div className="assistant-panel__debug-modal">
        <header className="assistant-panel__debug-header">
          <div>
            <h2 className="assistant-panel__debug-title">Developer tools</h2>
            <p className="assistant-panel__debug-subtitle">Internal diagnostics and manual state controls.</p>
          </div>
          <Button variant="secondary" onClick={onClose}>
            Close developer tools
          </Button>
        </header>

        <section className="assistant-panel__debug-section" aria-label="Connection">
          <h3 className="assistant-panel__debug-section-title">Connection</h3>
          <dl className="assistant-panel__debug-list">
            <div className="assistant-panel__debug-item">
              <dt className="assistant-panel__debug-label">Backend status</dt>
              <dd className="assistant-panel__debug-value">
                <StatusIndicator state={backendIndicatorState} size="sm" />
                <span>{backendLabel}</span>
              </dd>
            </div>
            <div className="assistant-panel__debug-item">
              <dt className="assistant-panel__debug-label">Backend lifecycle</dt>
              <dd className="assistant-panel__debug-value">{backendState}</dd>
            </div>
            <div className="assistant-panel__debug-item">
              <dt className="assistant-panel__debug-label">Token request</dt>
              <dd className="assistant-panel__debug-value">{tokenFeedback ?? 'Idle'}</dd>
            </div>
            <div className="assistant-panel__debug-item">
              <dt className="assistant-panel__debug-label">Mode</dt>
              <dd className="assistant-panel__debug-value">Fast</dd>
            </div>
            <div className="assistant-panel__debug-item">
              <dt className="assistant-panel__debug-label">Assistant state</dt>
              <dd className="assistant-panel__debug-value">
                <StatusIndicator state={assistantState} size="sm" />
                <span>{ASSISTANT_RUNTIME_STATE_LABELS[assistantState]}</span>
              </dd>
            </div>
          </dl>

          {backendState === 'failed' ? (
            <Button variant="secondary" size="sm" onClick={() => void onRetryBackendHealth()}>
              Retry backend
            </Button>
          ) : null}
        </section>

        <section className="assistant-panel__debug-section" aria-label="State overrides">
          <h3 className="assistant-panel__debug-section-title">Set assistant state</h3>
          <div className="assistant-panel__debug-state-buttons">
            {ASSISTANT_RUNTIME_STATES.map((state) => (
              <Button
                key={state}
                variant={assistantState === state ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => onSetAssistantState(state)}
              >
                {state}
              </Button>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  );
}
