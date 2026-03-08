import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationList } from './ConversationList';
import { MOCK_CONVERSATION_TURNS } from './mockConversation';

describe('ConversationList', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the empty state when there are no turns', () => {
    render(
      <ConversationList
        turns={[]}
        emptyState={
          <>
            <p>No conversation yet</p>
            <p>Start a session to see the live transcript.</p>
          </>
        }
      />,
    );

    expect(screen.getByText('No conversation yet')).toBeVisible();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('renders conversation turns in order with a non-blocking top fade', () => {
    render(
      <ConversationList
        turns={MOCK_CONVERSATION_TURNS.slice(0, 3)}
        emptyState={<p>No conversation yet</p>}
      />,
    );

    const items = screen.getAllByRole('listitem');

    expect(screen.getByRole('list')).toHaveClass('conversation-list__items');
    expect(screen.getByTestId('conversation-list-top-fade')).toHaveAttribute('aria-hidden', 'true');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Summarize the current screen in one sentence.');
    expect(items[2]).toHaveTextContent('Keep it compact and tell me if anything looks risky.');
  });

  it('follows the bottom when the user is already near the end', async () => {
    const scrollTo = vi.fn();

    const { rerender } = render(
      <ConversationList
        turns={MOCK_CONVERSATION_TURNS.slice(0, 4)}
        emptyState={<p>No conversation yet</p>}
      />,
    );

    const viewport = screen.getByTestId('conversation-list-viewport');

    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 220 },
      scrollHeight: { configurable: true, value: 480 },
      scrollTop: { configurable: true, writable: true, value: 258 },
    });
    Object.defineProperty(viewport, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });

    rerender(
      <ConversationList
        turns={MOCK_CONVERSATION_TURNS.slice(0, 5)}
        emptyState={<p>No conversation yet</p>}
      />,
    );

    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalled();
    });
  });

  it('does not force-scroll when the user has scrolled up', () => {
    const scrollTo = vi.fn();

    const { rerender } = render(
      <ConversationList
        turns={MOCK_CONVERSATION_TURNS.slice(0, 4)}
        emptyState={<p>No conversation yet</p>}
      />,
    );

    const viewport = screen.getByTestId('conversation-list-viewport');

    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 220 },
      scrollHeight: { configurable: true, value: 600 },
      scrollTop: { configurable: true, writable: true, value: 40 },
    });
    Object.defineProperty(viewport, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });

    rerender(
      <ConversationList
        turns={MOCK_CONVERSATION_TURNS.slice(0, 5)}
        emptyState={<p>No conversation yet</p>}
      />,
    );

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('keeps the scrollbar visible briefly while the user is scrolling', () => {
    vi.useFakeTimers();

    render(
      <ConversationList
        turns={MOCK_CONVERSATION_TURNS.slice(0, 4)}
        emptyState={<p>No conversation yet</p>}
      />,
    );

    const viewport = screen.getByTestId('conversation-list-viewport');

    expect(viewport).not.toHaveClass('conversation-list__viewport--scrolling');

    fireEvent.scroll(viewport);

    expect(viewport).toHaveClass('conversation-list__viewport--scrolling');

    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(viewport).not.toHaveClass('conversation-list__viewport--scrolling');

    vi.useRealTimers();
  });
});
