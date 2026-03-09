import type { ConversationTurnModel } from './types';

export const MOCK_CONVERSATION_TURNS: readonly ConversationTurnModel[] = [
  {
    id: 'turn-user-1',
    role: 'user',
    content: 'Summarize the current screen in one sentence.',
    timestamp: '09:41',
    state: 'complete',
  },
  {
    id: 'turn-assistant-1',
    role: 'assistant',
    content: 'You are viewing the Livepair overlay with the assistant dock expanded and the panel pinned open.',
    timestamp: '09:41',
    state: 'complete',
  },
  {
    id: 'turn-user-2',
    role: 'user',
    content: 'Keep it compact and tell me if anything looks risky.',
    timestamp: '09:42',
    state: 'complete',
  },
  {
    id: 'turn-assistant-2',
    role: 'assistant',
    content: 'The layout is stable, but the conversation area is empty, so there is no running transcript to anchor the user once a session starts.',
    timestamp: '09:42',
    state: 'complete',
  },
  {
    id: 'turn-user-3',
    role: 'user',
    content: 'What should we change first?',
    timestamp: '09:43',
    state: 'complete',
  },
  {
    id: 'turn-assistant-3',
    role: 'assistant',
    content: 'Start by replacing the placeholder card with a compact turn list, then layer in a streaming assistant response so scrolling, timing, and state transitions can be validated against the overlay.',
    timestamp: '09:43',
    state: 'complete',
  },
  {
    id: 'turn-assistant-error',
    role: 'assistant',
    content: 'The session stalled before the final response was delivered. Retry when the backend is available.',
    timestamp: '09:44',
    state: 'error',
    statusLabel: 'Error',
  },
];

export const MOCK_SESSION_SCRIPT = [
  {
    user: 'Give me a quick status readout.',
    assistant:
      'You are connected, the panel is responsive, and the conversation stream is now rendering in place instead of staying empty.',
  },
  {
    user: 'Any issues I should mention in the demo?',
    assistant:
      'The experience is optimized for short sessions right now, but the follow-bottom scroll behavior and streaming indicator are ready for realistic voice turns.',
  },
  {
    user: 'Wrap this run up with one final note.',
    assistant:
      'End-to-end flow is stable in development, including empty-state transition, live streaming, and session reset when the dock ends the run.',
  },
] as const;
