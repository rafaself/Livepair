import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConversationTurn } from './ConversationTurn';

function renderTurn({
  role,
  content,
  state = 'complete',
}: {
  role: 'user' | 'assistant';
  content: string;
  state?: 'complete' | 'streaming' | 'error';
}): HTMLElement {
  render(
    <ConversationTurn
      turn={{
        id: `${role}-${state}`,
        role,
        content,
        timestamp: '09:45',
        state,
      }}
    />,
  );

  return screen.getByRole('article', {
    name: `${role === 'user' ? 'User' : 'Assistant'} turn at 09:45`,
  });
}

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
    const meta = article.querySelector('.conversation-turn__meta');

    expect(article).toHaveClass('conversation-turn', 'conversation-turn--user');
    expect(screen.getByText('Transcribed speech from the user.')).toBeVisible();
    expect(screen.getByText('09:41')).toBeVisible();
    expect(meta).not.toBeNull();
    expect(article.querySelector('.conversation-turn__icon')).toBeNull();
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

  it('renders bold markdown in assistant messages', () => {
    const article = renderTurn({
      role: 'assistant',
      content: 'This is **important**.',
    });

    expect(article.querySelector('strong')).not.toBeNull();
    expect(article.querySelector('strong')?.textContent).toBe('important');
  });

  it('renders simple unordered lists in assistant messages for dash and star markers', () => {
    const article = renderTurn({
      role: 'assistant',
      content: '- first item\n* second item',
    });

    const items = article.querySelectorAll('ul li');

    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toBe('first item');
    expect(items[1]?.textContent).toBe('second item');
  });

  it('renders inline code markdown in assistant messages', () => {
    const article = renderTurn({
      role: 'assistant',
      content: 'Run `pnpm test` after the change.',
    });

    expect(article.querySelector('code')).not.toBeNull();
    expect(article.querySelector('code')?.textContent).toBe('pnpm test');
  });

  it('preserves paragraph breaks in assistant messages', () => {
    const article = renderTurn({
      role: 'assistant',
      content: 'First paragraph.\n\nSecond paragraph.',
    });

    const paragraphs = article.querySelectorAll('.conversation-turn__body p');

    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]?.textContent).toBe('First paragraph.');
    expect(paragraphs[1]?.textContent).toBe('Second paragraph.');
  });

  it('keeps markdown syntax literal in user messages', () => {
    const article = renderTurn({
      role: 'user',
      content: '**bold**\n- item\nUse `code`.',
    });
    const body = article.querySelector('.conversation-turn__body');

    expect(body?.textContent).toBe('**bold**\n- item\nUse `code`.');
    expect(article.querySelector('strong')).toBeNull();
    expect(article.querySelector('ul')).toBeNull();
    expect(article.querySelector('code')).toBeNull();
  });

  it('renders raw HTML from assistant content as text without creating HTML elements', () => {
    const article = renderTurn({
      role: 'assistant',
      content: '<script>window.__x = 1</script><b>unsafe</b>',
    });

    expect(article).toHaveTextContent('<script>window.__x = 1</script><b>unsafe</b>');
    expect(article.querySelector('script')).toBeNull();
    expect(article.querySelector('b')).toBeNull();
  });
});
