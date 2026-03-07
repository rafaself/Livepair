import {
  ASSISTANT_RUNTIME_STATES,
  ASSISTANT_RUNTIME_STATE_LABELS,
  type AssistantRuntimeState,
} from '../../state/assistantUiState';
import { StatusIndicator } from '../composite';
import { PanelSection } from '../layout';
import { Button } from '../primitives';
import type { BackendConnectionState } from './useAssistantPanelController';

export type AssistantPanelStatusSectionProps = {
  assistantState: AssistantRuntimeState;
  isPanelOpen: boolean;
  backendState: BackendConnectionState;
  backendIndicatorState: AssistantRuntimeState;
  backendLabel: string;
  showStateDevControls: boolean;
  onRetryBackendHealth: () => Promise<void>;
  onSetAssistantState: (state: AssistantRuntimeState) => void;
};

export function AssistantPanelStatusSection({
  assistantState,
  isPanelOpen,
  backendState,
  backendIndicatorState,
  backendLabel,
  showStateDevControls,
  onRetryBackendHealth,
  onSetAssistantState,
}: AssistantPanelStatusSectionProps): JSX.Element {
  return (
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
                onClick={() => void onRetryBackendHealth()}
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
                onClick={() => onSetAssistantState(state)}
              >
                {state}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </PanelSection>
  );
}
