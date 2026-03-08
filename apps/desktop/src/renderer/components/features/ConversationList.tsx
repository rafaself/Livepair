import { ArrowDown } from 'lucide-react';
import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { ConversationTurn } from './ConversationTurn';
import type { ConversationTurnModel } from './mockConversation';
import './ConversationList.css';

export type ConversationListProps = {
  turns: readonly ConversationTurnModel[];
  emptyState: ReactNode;
} & HTMLAttributes<HTMLDivElement>;

const AUTO_SCROLL_THRESHOLD = 32;

function getDistanceFromBottom(viewport: HTMLDivElement): number {
  return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
}

function requestFrame(callback: () => void): number {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    return window.requestAnimationFrame(callback);
  }

  return window.setTimeout(callback, 0);
}

function cancelFrame(frameId: number): void {
  if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(frameId);
    return;
  }

  window.clearTimeout(frameId);
}

function isNearBottom(viewport: HTMLDivElement): boolean {
  return getDistanceFromBottom(viewport) <= AUTO_SCROLL_THRESHOLD;
}

function scrollViewportToBottom(viewport: HTMLDivElement): void {
  if (typeof viewport.scrollTo === 'function') {
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
    return;
  }

  viewport.scrollTop = viewport.scrollHeight;
}

export function ConversationList({
  turns,
  emptyState,
  className,
  ...rest
}: ConversationListProps): JSX.Element {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const [showScrollToBottomButton, setShowScrollToBottomButton] = useState(false);
  const classes = `conversation-list${turns.length > 0 ? ' conversation-list--populated' : ''}${className ? ` ${className}` : ''}`;

  const handleScroll = (): void => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    const nearBottom = isNearBottom(viewport);

    shouldAutoScrollRef.current = nearBottom;
    setShowScrollToBottomButton(!nearBottom);
  };

  const handleScrollToBottomClick = (): void => {
    const viewport = viewportRef.current;

    shouldAutoScrollRef.current = true;
    setShowScrollToBottomButton(false);

    if (!viewport) {
      return;
    }

    scrollViewportToBottom(viewport);
  };

  useEffect(() => {
    if (turns.length === 0) {
      shouldAutoScrollRef.current = true;
      setShowScrollToBottomButton(false);
      return;
    }

    if (!shouldAutoScrollRef.current) {
      return;
    }

    const frameId = requestFrame(() => {
      const viewport = viewportRef.current;

      if (!viewport) {
        return;
      }

      scrollViewportToBottom(viewport);
    });

    return () => {
      cancelFrame(frameId);
    };
  }, [turns]);

  if (turns.length === 0) {
    return (
      <div className={classes} {...rest}>
        <div className="conversation-list__frame conversation-list__frame--empty">
          <div className="conversation-list__empty">
            {emptyState}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={classes} {...rest}>
      <div
        className="conversation-list__top-fade"
        data-testid="conversation-list-top-fade"
        aria-hidden="true"
      />
      <div className="conversation-list__frame">
        <div
          ref={viewportRef}
          className="conversation-list__viewport"
          data-testid="conversation-list-viewport"
          onScroll={handleScroll}
        >
          <div
            className="conversation-list__content"
            data-testid="conversation-list-content"
          >
            <ul className="conversation-list__items">
              {turns.map((turn) => (
                <li key={turn.id} className="conversation-list__item">
                  <ConversationTurn turn={turn} />
                </li>
              ))}
            </ul>
          </div>
        </div>
        {showScrollToBottomButton ? (
          <button
            type="button"
            className="conversation-list__scroll-to-bottom"
            aria-label="Scroll to latest messages"
            onClick={handleScrollToBottomClick}
          >
            <ArrowDown size={18} />
          </button>
        ) : null}
      </div>
      <div
        className="conversation-list__bottom-fade"
        data-testid="conversation-list-bottom-fade"
        aria-hidden="true"
      />
    </div>
  );
}
