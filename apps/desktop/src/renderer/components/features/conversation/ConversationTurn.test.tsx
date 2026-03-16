import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '../../../../shared/settings';
import { useSessionStore } from '../../../store/sessionStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { resetDesktopStores } from '../../../test/store';
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

function getBody(article: HTMLElement): HTMLElement | null {
  return article.querySelector('.conversation-turn__body');
}

describe('ConversationTurn', () => {
  beforeEach(() => {
    resetDesktopStores();
    useSettingsStore.setState({
      settings: DEFAULT_DESKTOP_SETTINGS,
      isReady: true,
    });
  });

  it('renders a user turn with timestamp and compact styling', () => {
    useSettingsStore.setState((state) => ({
      ...state,
      settings: {
        ...state.settings,
        chatTimestampVisibility: 'visible',
      },
      isReady: true,
    }));

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
    const article = renderTurn({
      role: 'assistant',
      content:
        'Line one\n\nLine two with a-super-long-token-that-should-wrap-cleanly-in-the-panel.',
    });
    const body = getBody(article);
    const paragraphs = article.querySelectorAll('.conversation-turn__body p');

    expect(body).toHaveClass('conversation-turn__body');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]?.textContent).toBe('Line one');
    expect(paragraphs[1]?.textContent).toBe(
      'Line two with a-super-long-token-that-should-wrap-cleanly-in-the-panel.',
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

  it('renders ordered lists in assistant messages', () => {
    const article = renderTurn({
      role: 'assistant',
      content: '1. first item\n2. second item',
    });

    const items = article.querySelectorAll('ol li');

    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toBe('first item');
    expect(items[1]?.textContent).toBe('second item');
  });

  it('renders fenced code blocks in assistant messages', () => {
    const article = renderTurn({
      role: 'assistant',
      content: '```ts\nconst answer = 42;\n```',
    });

    const codeBlock = article.querySelector('pre code');

    expect(codeBlock).not.toBeNull();
    expect(codeBlock).toHaveTextContent('const answer = 42;');
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

describe('ConversationTurn transcript artifact presentation', () => {
  it('applies transcript-complete modifier class to a completed transcript artifact', () => {
    render(
      <ConversationTurn
        turn={{
          kind: 'transcript',
          id: 'user-transcript-1',
          role: 'user',
          content: 'What is the capital of France?',
          timestamp: '09:50',
          state: 'complete',
          source: 'voice',
        }}
      />,
    );

    const article = screen.getByRole('article', { name: 'User transcript at 09:50' });

    expect(article).toHaveClass('conversation-turn--transcript-complete');
    expect(article).not.toHaveClass('conversation-turn--transcript-interrupted');
    expect(article).not.toHaveClass('conversation-turn--transcript-streaming');
  });

  it('applies transcript-streaming modifier class to a streaming transcript artifact', () => {
    render(
      <ConversationTurn
        turn={{
          kind: 'transcript',
          id: 'user-transcript-1',
          role: 'user',
          content: 'What is the capital of',
          timestamp: '09:50',
          state: 'streaming',
          source: 'voice',
        }}
      />,
    );

    const article = screen.getByRole('article', { name: 'User transcript at 09:50' });

    expect(article).toHaveClass('conversation-turn--transcript-streaming');
    expect(article).not.toHaveClass('conversation-turn--transcript-complete');
  });

  it('applies transcript-interrupted modifier class to an interrupted transcript', () => {
    render(
      <ConversationTurn
        turn={{
          kind: 'transcript',
          id: 'assistant-transcript-interrupted',
          role: 'assistant',
          content: 'Partial answer cut off mid',
          timestamp: '09:51',
          state: 'complete',
          source: 'voice',
          statusLabel: 'Interrupted',
        }}
      />,
    );

    const article = screen.getByRole('article', { name: 'Assistant transcript at 09:51' });

    expect(article).toHaveClass('conversation-turn--transcript-interrupted');
    expect(article).not.toHaveClass('conversation-turn--transcript-complete');
  });

  it('does not apply transcript classes to canonical turns', () => {
    render(
      <ConversationTurn
        turn={{
          id: 'assistant-turn-1',
          role: 'assistant',
          content: 'Canonical assistant response.',
          timestamp: '09:52',
          state: 'complete',
        }}
      />,
    );

    const article = screen.getByRole('article', { name: 'Assistant turn at 09:52' });

    expect(article).not.toHaveClass('conversation-turn--transcript-streaming');
    expect(article).not.toHaveClass('conversation-turn--transcript-complete');
    expect(article).not.toHaveClass('conversation-turn--transcript-interrupted');
  });

  it('does not apply interrupted class to a canonical turn even when it has a status label', () => {
    render(
      <ConversationTurn
        turn={{
          id: 'assistant-turn-error',
          role: 'assistant',
          content: 'Response failed.',
          timestamp: '09:53',
          state: 'error',
          statusLabel: 'Error',
        }}
      />,
    );

    const article = screen.getByRole('article', { name: 'Assistant turn at 09:53' });

    expect(article).not.toHaveClass('conversation-turn--transcript-streaming');
    expect(article).not.toHaveClass('conversation-turn--transcript-complete');
    expect(article).not.toHaveClass('conversation-turn--transcript-interrupted');
  });

  it('uses "transcript" in the aria-label for transcript artifacts instead of "turn"', () => {
    render(
      <ConversationTurn
        turn={{
          kind: 'transcript',
          id: 'assistant-transcript-2',
          role: 'assistant',
          content: 'Some transcribed reply',
          timestamp: '09:55',
          state: 'complete',
          source: 'voice',
        }}
      />,
    );

    expect(screen.getByRole('article', { name: 'Assistant transcript at 09:55' })).toBeVisible();
    expect(screen.queryByRole('article', { name: 'Assistant turn at 09:55' })).toBeNull();
  });

  it('does not show a copy button on a streaming assistant transcript artifact', () => {
    render(
      <ConversationTurn
        turn={{
          kind: 'transcript',
          id: 'assistant-transcript-no-copy',
          role: 'assistant',
          content: 'Transcribed assistant speech.',
          timestamp: '09:56',
          state: 'streaming',
          source: 'voice',
        }}
      />,
    );

    const article = screen.getByRole('article', { name: 'Assistant transcript at 09:56' });

    expect(article.querySelector('.conversation-turn__copy-btn')).toBeNull();
  });

  it('shows a copy button on a completed assistant transcript artifact', () => {
    render(
      <ConversationTurn
        turn={{
          kind: 'transcript',
          id: 'assistant-transcript-with-copy',
          role: 'assistant',
          content: 'Transcribed assistant speech.',
          timestamp: '09:56',
          state: 'complete',
          source: 'voice',
        }}
      />,
    );

    const article = screen.getByRole('article', { name: 'Assistant transcript at 09:56' });

    expect(article.querySelector('.conversation-turn__copy-btn')).not.toBeNull();
    expect(screen.queryByText('Voice')).toBeNull();
  });

  it('shows a copy button on a canonical assistant turn', () => {
    render(
      <ConversationTurn
        turn={{
          id: 'assistant-canonical',
          role: 'assistant',
          content: 'Canonical assistant reply.',
          timestamp: '09:57',
          state: 'complete',
        }}
      />,
    );

    const article = screen.getByRole('article', { name: 'Assistant turn at 09:57' });

    expect(article.querySelector('.conversation-turn__copy-btn')).not.toBeNull();
  });

  it('shows a thinking toggle for assistant turns with thinking text', () => {
    render(
      <ConversationTurn
        turn={{
          id: 'assistant-thinking-toggle',
          role: 'assistant',
          content: 'Canonical assistant reply.',
          timestamp: '09:58',
          state: 'complete',
          answerMetadata: {
            provenance: 'unverified',
            thinkingText: 'First pass reasoning',
          },
        }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Show assistant thinking' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('opens and closes assistant thinking inline', () => {
    render(
      <ConversationTurn
        turn={{
          id: 'assistant-thinking-inline',
          role: 'assistant',
          content: 'Canonical assistant reply.',
          timestamp: '09:59',
          state: 'complete',
          answerMetadata: {
            provenance: 'unverified',
            thinkingText: 'First pass reasoning',
          },
        }}
      />,
    );

    const toggle = screen.getByRole('button', { name: 'Show assistant thinking' });
    const thinkingRegionId = toggle.getAttribute('aria-controls');

    expect(thinkingRegionId).not.toBeNull();

    const thinkingRegion = document.getElementById(thinkingRegionId!);

    expect(thinkingRegion).not.toBeNull();

    expect(screen.getByText('First pass reasoning')).not.toBeVisible();
    expect(thinkingRegion).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(toggle);

    expect(screen.getByText('First pass reasoning')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Hide assistant thinking' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(thinkingRegion).toHaveAttribute('aria-hidden', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Hide assistant thinking' }));

    expect(screen.getByText('First pass reasoning')).not.toBeVisible();
    expect(screen.getByRole('button', { name: 'Show assistant thinking' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(thinkingRegion).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows a thinking toggle for a live assistant transcript using its attached turn metadata', () => {
    useSessionStore.getState().appendConversationTurn({
      id: 'assistant-turn-linked',
      role: 'assistant',
      content: 'Canonical assistant reply.',
      timestamp: '10:00',
      state: 'complete',
      answerMetadata: {
        provenance: 'unverified',
        thinkingText: 'Linked canonical reasoning',
      },
    });

    render(
      <ConversationTurn
        turn={{
          kind: 'transcript',
          id: 'assistant-transcript-linked',
          role: 'assistant',
          content: 'Canonical assistant reply.',
          timestamp: '10:00',
          state: 'complete',
          source: 'voice',
          attachedTurnId: 'assistant-turn-linked',
        }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Show assistant thinking' })).toBeVisible();
  });

  it('renders thinking text as markdown when expanded', () => {
    render(
      <ConversationTurn
        turn={{
          id: 'assistant-thinking-markdown',
          role: 'assistant',
          content: 'Canonical assistant reply.',
          timestamp: '10:00',
          state: 'complete',
          answerMetadata: {
            provenance: 'unverified',
            thinkingText: 'Use **bold** and `code` here.',
          },
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show assistant thinking' }));

    const thinkingRegion = screen.getByRole('region', { name: 'Assistant thinking' });

    expect(thinkingRegion.querySelector('strong')?.textContent).toBe('bold');
    expect(thinkingRegion.querySelector('code')?.textContent).toBe('code');
  });

  it('does not show thinking UI for assistant turns without thinking text', () => {
    render(
      <ConversationTurn
        turn={{
          id: 'assistant-without-thinking',
          role: 'assistant',
          content: 'Canonical assistant reply.',
          timestamp: '10:00',
          state: 'complete',
          answerMetadata: {
            provenance: 'unverified',
          },
        }}
      />,
    );

    expect(screen.queryByRole('button', { name: /assistant thinking/i })).toBeNull();
    expect(screen.queryByText('First pass reasoning')).toBeNull();
  });

  it('keeps the copy action working for assistant turns with thinking text', () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(
      <ConversationTurn
        turn={{
          id: 'assistant-thinking-copy',
          role: 'assistant',
          content: 'Canonical assistant reply.',
          timestamp: '10:01',
          state: 'complete',
          answerMetadata: {
            provenance: 'unverified',
            thinkingText: 'First pass reasoning',
          },
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));

    expect(writeText).toHaveBeenCalledWith('Canonical assistant reply.');
  });
});

describe('ConversationTurn typed note presentation', () => {
  it('applies the typed-note class and Note badge to a user turn with source text', () => {
    render(
      <ConversationTurn
        turn={{
          id: 'user-typed-note-1',
          role: 'user',
          content: 'Can you explain that further?',
          timestamp: '10:01',
          state: 'complete',
          source: 'text',
        }}
      />,
    );

    const article = screen.getByRole('article', { name: 'User turn at 10:01' });

    expect(article).toHaveClass('conversation-turn--typed-note');
    expect(screen.getByText('Note')).toBeVisible();
  });

  it('does not apply typed-note treatment to a spoken user turn', () => {
    render(
      <ConversationTurn
        turn={{
          id: 'user-spoken-1',
          role: 'user',
          content: 'What I said out loud.',
          timestamp: '10:02',
          state: 'complete',
          source: 'voice',
        }}
      />,
    );

    const article = screen.getByRole('article', { name: 'User turn at 10:02' });

    expect(article).not.toHaveClass('conversation-turn--typed-note');
    expect(screen.queryByText('Note')).toBeNull();
  });

  it('does not apply typed-note treatment to a user turn with no source set', () => {
    render(
      <ConversationTurn
        turn={{
          id: 'user-no-source',
          role: 'user',
          content: 'Generic user turn.',
          timestamp: '10:03',
          state: 'complete',
        }}
      />,
    );

    const article = screen.getByRole('article', { name: 'User turn at 10:03' });

    expect(article).not.toHaveClass('conversation-turn--typed-note');
    expect(screen.queryByText('Note')).toBeNull();
  });
});
