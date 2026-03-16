import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationList } from './ConversationList';
import { MOCK_CONVERSATION_TURNS } from '../../../test/fixtures/conversation';

function setViewportMetrics(
  viewport: HTMLElement,
  {
    clientHeight,
    scrollHeight,
    scrollTop,
    scrollTo = vi.fn(),
  }: {
    clientHeight: number;
    scrollHeight: number;
    scrollTop: number;
    scrollTo?: ReturnType<typeof vi.fn>;
  },
): ReturnType<typeof vi.fn> {
  Object.defineProperties(viewport, {
    clientHeight: { configurable: true, value: clientHeight },
    scrollHeight: { configurable: true, value: scrollHeight },
    scrollTop: { configurable: true, writable: true, value: scrollTop },
  });
  Object.defineProperty(viewport, 'scrollTo', {
    configurable: true,
    value: scrollTo,
  });

  return scrollTo;
}

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

  it('renders conversation turns in order with non-blocking top and bottom fades', () => {
    render(
      <ConversationList
        turns={MOCK_CONVERSATION_TURNS.slice(0, 3)}
        emptyState={<p>No conversation yet</p>}
      />,
    );

    const items = screen.getAllByRole('listitem');

    expect(screen.getByRole('list')).toHaveClass('conversation-list__items');
    expect(screen.getByTestId('conversation-list-top-fade')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('conversation-list-bottom-fade')).toHaveAttribute('aria-hidden', 'true');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Summarize the current screen in one sentence.');
    expect(items[2]).toHaveTextContent('Keep it compact and tell me if anything looks risky.');
  });

  it('renders populated conversation content inside a bottom-anchor wrapper', () => {
    render(
      <ConversationList
        turns={MOCK_CONVERSATION_TURNS.slice(0, 2)}
        emptyState={<p>No conversation yet</p>}
      />,
    );

    const viewport = screen.getByTestId('conversation-list-viewport');
    const content = screen.getByTestId('conversation-list-content');

    expect(content).toHaveClass('conversation-list__content');
    expect(viewport.firstElementChild).toBe(content);
    expect(screen.getByRole('list')).toBeVisible();
  });

  it('scrolls to the latest message on initial mount', async () => {
    let scheduledFrame: FrameRequestCallback | null = null;

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      scheduledFrame = callback;
      return 1;
    });

    render(
      <ConversationList
        turns={MOCK_CONVERSATION_TURNS.slice(0, 4)}
        emptyState={<p>No conversation yet</p>}
      />,
    );

    const viewport = screen.getByTestId('conversation-list-viewport');
    const scrollTo = setViewportMetrics(viewport, {
      clientHeight: 220,
      scrollHeight: 480,
      scrollTop: 0,
    });

    expect(scheduledFrame).not.toBeNull();
    scheduledFrame!(16.7);

    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalledWith({ top: 480, behavior: 'smooth' });
    });
  });

  it('follows the bottom when the user is already near the end', async () => {
    const { rerender } = render(
      <ConversationList
        turns={MOCK_CONVERSATION_TURNS.slice(0, 4)}
        emptyState={<p>No conversation yet</p>}
      />,
    );

    const viewport = screen.getByTestId('conversation-list-viewport');
    const scrollTo = setViewportMetrics(viewport, {
      clientHeight: 220,
      scrollHeight: 480,
      scrollTop: 258,
    });

    scrollTo.mockClear();

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

  it('uses an immediate bottom sync for live updates to the same turn', async () => {
    const turns = MOCK_CONVERSATION_TURNS.slice(0, 4);
    const updatedTurns = turns.map((turn, index) =>
      index === turns.length - 1
        ? {
            ...turn,
            content: `${turn.content} Updated while streaming.`,
          }
        : turn,
    );

    const { rerender } = render(
      <ConversationList
        turns={turns}
        emptyState={<p>No conversation yet</p>}
      />,
    );

    const viewport = screen.getByTestId('conversation-list-viewport');
    const scrollTo = setViewportMetrics(viewport, {
      clientHeight: 220,
      scrollHeight: 480,
      scrollTop: 258,
    });

    scrollTo.mockClear();

    rerender(
      <ConversationList
        turns={updatedTurns}
        emptyState={<p>No conversation yet</p>}
      />,
    );

    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalledWith({ top: 480, behavior: 'auto' });
    });
  });

  it('does not force-scroll when the user has scrolled up', () => {
    const { rerender } = render(
      <ConversationList
        turns={MOCK_CONVERSATION_TURNS.slice(0, 4)}
        emptyState={<p>No conversation yet</p>}
      />,
    );

    const viewport = screen.getByTestId('conversation-list-viewport');
    const scrollTo = setViewportMetrics(viewport, {
      clientHeight: 220,
      scrollHeight: 600,
      scrollTop: 40,
    });

    fireEvent.scroll(viewport);
    scrollTo.mockClear();

    rerender(
      <ConversationList
        turns={MOCK_CONVERSATION_TURNS.slice(0, 5)}
        emptyState={<p>No conversation yet</p>}
      />,
    );

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('resumes auto-scroll after the user returns near the bottom', async () => {
    const { rerender } = render(
      <ConversationList
        turns={MOCK_CONVERSATION_TURNS.slice(0, 4)}
        emptyState={<p>No conversation yet</p>}
      />,
    );

    const viewport = screen.getByTestId('conversation-list-viewport');
    const scrollTo = setViewportMetrics(viewport, {
      clientHeight: 220,
      scrollHeight: 600,
      scrollTop: 40,
    });

    fireEvent.scroll(viewport);
    scrollTo.mockClear();

    rerender(
      <ConversationList
        turns={MOCK_CONVERSATION_TURNS.slice(0, 5)}
        emptyState={<p>No conversation yet</p>}
      />,
    );

    expect(scrollTo).not.toHaveBeenCalled();

    viewport.scrollTop = 352;
    fireEvent.scroll(viewport);

    rerender(
      <ConversationList
        turns={MOCK_CONVERSATION_TURNS}
        emptyState={<p>No conversation yet</p>}
      />,
    );

    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalledWith({ top: 600, behavior: 'smooth' });
    });
  });

  it('shows a scroll-to-bottom button after the user scrolls away from the end', () => {
    render(
      <ConversationList
        turns={MOCK_CONVERSATION_TURNS.slice(0, 4)}
        emptyState={<p>No conversation yet</p>}
      />,
    );

    const viewport = screen.getByTestId('conversation-list-viewport');

    setViewportMetrics(viewport, {
      clientHeight: 220,
      scrollHeight: 600,
      scrollTop: 40,
    });

    fireEvent.scroll(viewport);

    expect(screen.getByRole('button', { name: 'Scroll to latest messages' })).toBeVisible();
  });

  it('hides the scroll-to-bottom button when the user returns near the end', () => {
    render(
      <ConversationList
        turns={MOCK_CONVERSATION_TURNS.slice(0, 4)}
        emptyState={<p>No conversation yet</p>}
      />,
    );

    const viewport = screen.getByTestId('conversation-list-viewport');

    setViewportMetrics(viewport, {
      clientHeight: 220,
      scrollHeight: 600,
      scrollTop: 40,
    });

    fireEvent.scroll(viewport);
    expect(screen.getByRole('button', { name: 'Scroll to latest messages' })).toBeVisible();

    viewport.scrollTop = 352;
    fireEvent.scroll(viewport);

    expect(screen.queryByRole('button', { name: 'Scroll to latest messages' })).toBeNull();
  });

  it('scrolls to the bottom and hides the button when pressed', async () => {
    render(
      <ConversationList
        turns={MOCK_CONVERSATION_TURNS.slice(0, 4)}
        emptyState={<p>No conversation yet</p>}
      />,
    );

    const viewport = screen.getByTestId('conversation-list-viewport');
    const scrollTo = setViewportMetrics(viewport, {
      clientHeight: 220,
      scrollHeight: 600,
      scrollTop: 40,
    });

    fireEvent.scroll(viewport);

    fireEvent.click(screen.getByRole('button', { name: 'Scroll to latest messages' }));

    expect(scrollTo).toHaveBeenCalledWith({ top: 600, behavior: 'smooth' });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Scroll to latest messages' })).toBeNull();
    });
  });
});
