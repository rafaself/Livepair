export type AssistantPanelState = 'collapsed' | 'expanded';

export type AssistantRuntimeState =
  | 'disconnected'
  | 'ready'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error';

export type AssistantUiState = {
  panel: AssistantPanelState;
  runtime: AssistantRuntimeState;
};

export const ASSISTANT_PANEL_STATES: readonly AssistantPanelState[] = [
  'collapsed',
  'expanded',
];

export const ASSISTANT_RUNTIME_STATES: readonly AssistantRuntimeState[] = [
  'disconnected',
  'ready',
  'listening',
  'thinking',
  'speaking',
  'error',
];

export const ASSISTANT_PANEL_STATE_LABELS: Record<AssistantPanelState, string> = {
  collapsed: 'Collapsed',
  expanded: 'Expanded',
};

export const ASSISTANT_RUNTIME_STATE_LABELS: Record<AssistantRuntimeState, string> = {
  disconnected: 'Disconnected',
  ready: 'Ready',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  error: 'Error',
};
