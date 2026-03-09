import { Eye, SlidersHorizontal, Wifi } from 'lucide-react';
import {
  ASSISTANT_RUNTIME_STATES,
  ASSISTANT_RUNTIME_STATE_LABELS,
  type AssistantRuntimeState,
} from '../../state/assistantUiState';
import { FieldList, StatusIndicator } from '../composite';
import { ViewSection } from '../layout';
import { Button } from '../primitives';
import type { BackendConnectionState } from '../../store/sessionStore';
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

      <ViewSection icon={Wifi} title="Connection">
        <FieldList
          items={[
            {
              label: 'Backend status',
              value: (
                <>
                  <StatusIndicator state={backendIndicatorState} size="sm" />
                  <span>{backendLabel}</span>
                </>
              ),
            },
            {
              label: 'Backend lifecycle',
              value: (
                <>
                  <StatusIndicator state={backendIndicatorState} size="sm" />
                  <span>{backendState.charAt(0).toUpperCase() + backendState.slice(1)}</span>
                </>
              ),
            },
            { label: 'Token request', value: tokenFeedback ?? 'Idle' },
            { label: 'Mode', value: 'Fast' },
            {
              label: 'Assistant state',
              value: (
                <>
                  <StatusIndicator state={assistantState} size="sm" />
                  <span>{ASSISTANT_RUNTIME_STATE_LABELS[assistantState]}</span>
                </>
              ),
            },
          ]}
        />
        {backendState === 'failed' ? (
          <Button variant="secondary" size="sm" onClick={() => void onRetryBackendHealth()}>
            Retry backend
          </Button>
        ) : null}
      </ViewSection>

      <ViewSection icon={Eye} title="Preview">
        <AssistantPanelStateHero state={assistantState} />
      </ViewSection>

      <ViewSection icon={SlidersHorizontal} title="Set assistant state">
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
      </ViewSection>
    </div>
  );
}
