import {
  ASSISTANT_RUNTIME_STATE_LABELS,
  type AssistantRuntimeState,
} from '../../runtime/public';
import './StatusIndicator.css';

export type StatusIndicatorProps = {
  state: AssistantRuntimeState;
  size?: 'sm' | 'md';
};

export function StatusIndicator({
  state,
  size = 'md',
}: StatusIndicatorProps): JSX.Element {
  return (
    <span
      className={`status-indicator status-indicator--${size} status-indicator--${state}`}
      role="status"
      aria-label={ASSISTANT_RUNTIME_STATE_LABELS[state]}
    />
  );
}
