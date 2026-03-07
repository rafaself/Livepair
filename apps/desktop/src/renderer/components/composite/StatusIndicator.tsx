import './StatusIndicator.css';

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'ready'
  | 'listening'
  | 'speaking'
  | 'error';

const STATE_LABELS: Record<ConnectionState, string> = {
  disconnected: 'Disconnected',
  connecting: 'Connecting',
  ready: 'Ready',
  listening: 'Listening',
  speaking: 'Speaking',
  error: 'Error',
};

export type StatusIndicatorProps = {
  state: ConnectionState;
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
      aria-label={STATE_LABELS[state]}
    />
  );
}
