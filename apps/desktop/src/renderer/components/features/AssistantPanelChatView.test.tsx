import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ConversationTurnModel } from './mockConversation';
import { AssistantPanelChatView } from './AssistantPanelChatView';

describe('AssistantPanelChatView', () => {
  it('renders the empty conversation state when there are no turns', () => {
    render(
      <AssistantPanelChatView
        assistantState="disconnected"
        turns={[]}
        isConversationEmpty={true}
      />,
    );

    expect(screen.getByRole('status', { name: 'Disconnected' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Conversation' })).toBeVisible();
    expect(screen.getByText('No conversation yet')).toBeVisible();
  });

  it('renders populated conversation turns without the empty state copy', () => {
    const turns: ConversationTurnModel[] = [
      {
        id: 'turn-1',
        role: 'user',
        content: 'Check the latest exchange.',
        timestamp: '10:15',
        state: 'complete',
      },
      {
        id: 'turn-2',
        role: 'assistant',
        content: 'The latest exchange is visible in the transcript.',
        timestamp: '10:16',
        state: 'complete',
      },
    ];

    render(
      <AssistantPanelChatView
        assistantState="ready"
        turns={turns}
        isConversationEmpty={false}
      />,
    );

    expect(screen.getByRole('status', { name: 'Ready' })).toBeVisible();
    expect(screen.getByText('Check the latest exchange.')).toBeVisible();
    expect(screen.getByText('The latest exchange is visible in the transcript.')).toBeVisible();
    expect(screen.queryByText('No conversation yet')).toBeNull();
  });
});
