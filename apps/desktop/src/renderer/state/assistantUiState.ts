export type AssistantRuntimeState =
  | 'disconnected'
  | 'ready'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error';

export const ASSISTANT_RUNTIME_STATE_LABELS: Record<AssistantRuntimeState, string> = {
  disconnected: 'Disconnected',
  ready: 'Ready',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  error: 'Error',
};
