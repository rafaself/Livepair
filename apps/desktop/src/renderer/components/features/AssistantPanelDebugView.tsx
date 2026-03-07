import { Eye, SlidersHorizontal, Wifi } from 'lucide-react';
import {
  ASSISTANT_RUNTIME_STATES,
  ASSISTANT_RUNTIME_STATE_LABELS,
  type AssistantRuntimeState,
} from '../../state/assistantUiState';
import { StatusIndicator } from '../composite';
import { Button } from '../primitives';
import type { BackendConnectionState } from './useAssistantPanelController';
import { AssistantPanelStateHero } from './AssistantPanelStateHero';

export type AssistantPanelDebugViewProps = {
  assistantState: AssistantRuntimeState;
  backendState: BackendConnectionState;
  backendIndicatorState: AssistantRuntimeState;
  backendLabel: string;
  tokenFeedback: string | null;
  onRetryBackendHealth: () => Promise<void>;
  onSetAssistantState: (state: AssistantRuntimeState) => void;
};

export function AssistantPanelDebugView({
  assistantState,
  backendState,
  backendIndicatorState,
  backendLabel,
  tokenFeedback,
  onRetryBackendHealth,
  onSetAssistantState,
}: AssistantPanelDebugViewProps): JSX.Element {
  return (
    <div className="assistant-panel__debug-modal">
      <h2 className="assistant-panel__debug-title">Developer tools</h2>

      <section className="assistant-panel__debug-section" aria-label="Connection">
        <div className="assistant-panel__section-header">
          <Wifi size={13} color="var(--color-text-primary)" aria-hidden="true" />
          <h3 className="assistant-panel__debug-section-title">Connection</h3>
          <div className="assistant-panel__section-header-rule" />
        </div>
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

      <section className="assistant-panel__debug-section" aria-label="Preview">
        <div className="assistant-panel__section-header">
          <Eye size={13} color="var(--color-text-primary)" aria-hidden="true" />
          <h3 className="assistant-panel__debug-section-title">Preview</h3>
          <div className="assistant-panel__section-header-rule" />
        </div>
        <AssistantPanelStateHero state={assistantState} />
      </section>

      <section className="assistant-panel__debug-section" aria-label="State overrides">
        <div className="assistant-panel__section-header">
          <SlidersHorizontal size={13} color="var(--color-text-primary)" aria-hidden="true" />
          <h3 className="assistant-panel__debug-section-title">Set assistant state</h3>
          <div className="assistant-panel__section-header-rule" />
        </div>
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
  );
}
