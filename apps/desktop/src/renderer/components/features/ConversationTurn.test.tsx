import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConversationTurn } from './ConversationTurn';

describe('ConversationTurn', () => {
  it('renders a user turn with timestamp and compact styling', () => {
    render(
      <ConversationTurn
        turn={{
          id: 'user-1',
          role: 'user',
          content: 'Transcribed speech from the user.',
          timestamp: '09:41',
          state: 'complete',
        }}
      />,
    );

    const article = screen.getByRole('article', { name: 'User turn at 09:41' });

    expect(article).toHaveClass('conversation-turn', 'conversation-turn--user');
    expect(screen.getByText('Transcribed speech from the user.')).toBeVisible();
    expect(screen.getByText('09:41')).toBeVisible();
  });

  it('renders an assistant error turn with a badge', () => {
    render(
      <ConversationTurn
        turn={{
          id: 'assistant-error',
          role: 'assistant',
          content: 'The response failed to stream.',
          timestamp: '09:42',
          state: 'error',
          statusLabel: 'Error',
        }}
      />,
    );

    const article = screen.getByRole('article', { name: 'Assistant turn at 09:42' });

    expect(article).toHaveClass('conversation-turn', 'conversation-turn--assistant');
    expect(screen.getByText('Error')).toBeVisible();
    expect(screen.getByText('The response failed to stream.')).toBeVisible();
  });

  it('renders a typing indicator for a streaming assistant turn without visible content', () => {
    render(
      <ConversationTurn
        turn={{
          id: 'assistant-streaming',
          role: 'assistant',
          content: '',
          timestamp: '09:43',
          state: 'streaming',
          statusLabel: 'Thinking...',
        }}
      />,
    );

    expect(screen.getByLabelText('Assistant is thinking')).toBeVisible();
    expect(screen.getByText('Thinking...')).toBeVisible();
  });

  it('preserves whitespace and wraps long content safely', () => {
    render(
      <ConversationTurn
        turn={{
          id: 'assistant-long',
          role: 'assistant',
          content: 'Line one\n\nLine two with a-super-long-token-that-should-wrap-cleanly-in-the-panel.',
          timestamp: '09:44',
          state: 'complete',
        }}
      />,
    );

    const body = screen.getByText(/Line one/);

    expect(body).toHaveClass('conversation-turn__body');
    expect(body.textContent).toBe(
      'Line one\n\nLine two with a-super-long-token-that-should-wrap-cleanly-in-the-panel.',
    );
  });
});
